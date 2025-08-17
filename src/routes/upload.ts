// Upload API routes for multipart file uploads
// Handles session creation, part uploads, completion, and metadata processing

import { Hono } from "hono";
import type { Env } from "../middleware/auth";
import { requireUserJwt } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import { getUploadService } from "../services/service-factory";

const upload = new Hono<{
  Bindings: Env;
  Variables: { userAuth: AuthPayload };
}>();

upload.use("*", requireUserJwt);

// Start a new upload session
upload.post("/start", async (c) => {
  try {
    const { filename, fileSize, contentType } = await c.req.json();
    const userId = c.get("userAuth")?.username || "anonymous";

    if (!filename || !fileSize) {
      return c.json({ error: "Filename and fileSize are required" }, 400);
    }

    const uploadService = getUploadService(c.env);
    const result = await uploadService.startUpload(
      userId,
      filename,
      fileSize,
      contentType
    );

    console.log(`[Upload] Started upload session:`, {
      sessionId: result.sessionId,
      fileKey: result.fileKey,
      totalParts: result.totalParts,
    });

    return c.json({
      sessionId: result.sessionId,
      uploadId: result.uploadId,
      fileKey: result.fileKey,
      totalParts: result.totalParts,
      autoRAGChunking: result.autoRAGChunking,
    });
  } catch (error) {
    console.error("[Upload] Error starting upload:", error);
    return c.json({ error: "Failed to start upload" }, 500);
  }
});

// Upload a part of the multipart upload
upload.post("/part", async (c) => {
  try {
    const formData = await c.req.formData();
    const sessionId = formData.get("sessionId") as string;
    const partNumber = parseInt(formData.get("partNumber") as string, 10);
    const file = formData.get("file") as File;

    if (!sessionId || !partNumber || !file) {
      return c.json(
        { error: "sessionId, partNumber, and file are required" },
        400
      );
    }

    const uploadService = getUploadService(c.env);
    const arrayBuffer = await file.arrayBuffer();
    const result = await uploadService.uploadPart(
      sessionId,
      partNumber,
      arrayBuffer
    );

    console.log(`[Upload] Uploaded part:`, {
      sessionId,
      partNumber,
      etag: result.etag,
      size: result.size,
    });

    return c.json({
      success: true,
      partNumber,
      etag: result.etag,
      size: result.size,
      autoRAGChunks: result.autoRAGChunks,
    });
  } catch (error) {
    console.error("[Upload] Error uploading part:", error);
    return c.json({ error: "Failed to upload part" }, 500);
  }
});

// Complete the multipart upload
upload.post("/complete", async (c) => {
  try {
    const { sessionId } = await c.req.json();
    const userId = c.get("userAuth")?.username || "anonymous";

    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }

    const uploadService = getUploadService(c.env);
    const { fileKey, metadata } = await uploadService.completeUpload(sessionId);

    console.log(`[Upload] AutoRAG processing will be triggered for ${fileKey}`);

    // Always count AutoRAG parts since we always create them
    const parts = fileKey.split("/");
    const username = parts[0];
    const originalFilename = parts[parts.length - 1] || "unknown";
    const prefix = `${username}/part-`;
    const objects = await c.env.FILE_BUCKET.list({ prefix });
    const partCount =
      objects.objects?.filter(
        (obj) =>
          obj.key.includes(`part-`) &&
          obj.key.includes(originalFilename) &&
          (obj.key.endsWith(".txt") || obj.key.endsWith(".chunk"))
      ).length || 0;

    // Leave metadata blank - let AutoRAG generate meaningful metadata
    const processedMetadata = {
      description: "",
      tags: [],
      vectorId: null,
    };

    // Also create an entry in the pdf_files table for PDF tools
    const now = new Date().toISOString();
    const pdfFileId = crypto.randomUUID();

    // Extract filename from fileKey
    const filename = fileKey.split("/").pop() || metadata.filename;

    try {
      await c.env.DB.prepare(
        "INSERT INTO pdf_files (id, file_key, file_name, description, tags, username, status, created_at, file_size, chunk_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
        .bind(
          pdfFileId,
          fileKey,
          filename,
          processedMetadata.description || "",
          JSON.stringify(processedMetadata.tags || []),
          userId,
          "completed",
          now,
          metadata.fileSize || 0,
          partCount
        )
        .run();

      console.log(`[Upload] Created PDF file entry:`, {
        pdfFileId,
        fileKey,
        filename,
        userId,
      });
    } catch (error) {
      console.error("[Upload] Error creating PDF file entry:", error);
      // Don't fail the upload if PDF file entry creation fails
    }

    console.log(`[Upload] Completed upload:`, {
      sessionId,
      fileKey,
      metadataId: metadata.id,
      description: processedMetadata.description,
      tags: processedMetadata.tags,
    });

    const userAuth = c.get("userAuth");
    if (userAuth) {
      console.log(`[Upload] Triggering AutoRAG processing for: ${fileKey}`);
      await c.env.PDF_PROCESSING_QUEUE.send({
        fileKey: fileKey,
        username: userAuth.username,
        openaiApiKey: userAuth.openaiApiKey,
        metadata: {
          description: processedMetadata.description || "",
          tags: processedMetadata.tags || [],
          filename:
            metadata.filename || fileKey.split("/").pop() || "unknown.pdf",
          file_size: metadata.fileSize || 0,
          status: "processing" as const,
          created_at: new Date().toISOString(),
        },
      });
      console.log(`[Upload] AutoRAG processing queued for: ${fileKey}`);
    } else {
      console.warn(
        `[Upload] No user auth found, skipping AutoRAG processing for: ${fileKey}`
      );
    }

    return c.json({
      success: true,
      fileKey,
      metadata: {
        ...metadata,
        description: processedMetadata.description,
        tags: processedMetadata.tags,
        status: "completed",
      },
    });
  } catch (error) {
    console.error("[Upload] Error completing upload:", error);
    return c.json({ error: "Failed to complete upload" }, 500);
  }
});

// Get upload progress
upload.get("/progress/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const uploadService = getUploadService(c.env);
    const progress = await uploadService.getProgress(sessionId);

    return c.json({
      success: true,
      progress,
    });
  } catch (error) {
    console.error("[Upload] Error getting progress:", error);
    return c.json({ error: "Failed to get progress" }, 500);
  }
});

// Clean up upload session
upload.delete("/session/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const uploadService = getUploadService(c.env);
    await uploadService.cleanupSession(sessionId);

    return c.json({ success: true });
  } catch (error) {
    console.error("[Upload] Error cleaning up session:", error);
    return c.json({ error: "Failed to clean up session" }, 500);
  }
});

export { upload };
