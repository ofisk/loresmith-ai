// Upload API route handlers for multipart file uploads
// Handles session creation, part uploads, completion, and metadata processing

import type { Context } from "hono";
import { getUploadService } from "../services/service-factory";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";

// Extend the context to include userAuth
type ContextWithAuth = Context<{
  Bindings: Env;
  Variables: { userAuth: AuthPayload };
}>;

export async function handleUploadStart(c: ContextWithAuth) {
  try {
    const { filename, fileSize, contentType } = await c.req.json();
    const userAuth = (c as any).userAuth as AuthPayload;
    console.log("[handleUploadStart] userAuth:", userAuth);
    const userId = userAuth?.username || "anonymous";
    console.log("[handleUploadStart] Using userId:", userId);

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
}

export async function handleUploadPart(c: ContextWithAuth) {
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
}

export async function handleUploadComplete(c: ContextWithAuth) {
  try {
    const { sessionId } = await c.req.json();
    const userAuth = (c as any).userAuth as AuthPayload;
    console.log("[handleUploadComplete] userAuth:", userAuth);
    const userId = userAuth?.username || "anonymous";
    console.log("[handleUploadComplete] Using userId:", userId);

    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }

    const uploadService = getUploadService(c.env);
    const { fileKey, metadata } = await uploadService.completeUpload(sessionId);

    console.log(`[Upload] AutoRAG processing will be triggered for ${fileKey}`);

    // Leave metadata blank - let AutoRAG generate meaningful metadata
    const processedMetadata = {
      description: "",
      tags: [],
      vectorId: null,
    };

    console.log(`[Upload] Completed upload:`, {
      sessionId,
      fileKey,
      metadataId: metadata.id,
      description: processedMetadata.description,
      tags: processedMetadata.tags,
    });

    if (userAuth?.username) {
      console.log(`[Upload] Triggering AutoRAG processing for: ${fileKey}`);
      await c.env.FILE_PROCESSING_QUEUE.send({
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
}

export async function handleUploadProgress(c: ContextWithAuth) {
  try {
    const sessionId = c.req.param("sessionId");
    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }
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
}

export async function handleUploadSessionCleanup(c: ContextWithAuth) {
  try {
    const sessionId = c.req.param("sessionId");
    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }
    const uploadService = getUploadService(c.env);
    await uploadService.cleanupSession(sessionId);

    return c.json({ success: true });
  } catch (error) {
    console.error("[Upload] Error cleaning up session:", error);
    return c.json({ error: "Failed to clean up session" }, 500);
  }
}
