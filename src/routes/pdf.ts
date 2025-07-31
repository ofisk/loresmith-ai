import type { Context } from "hono";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import { completeProgress } from "../services/progress";
import { RAGService } from "../lib/rag";

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

// Generate upload URL for PDF
export async function handleGenerateUploadUrl(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { filename, contentType } = await c.req.json();

    if (!filename) {
      return c.json({ error: "Filename is required" }, 400);
    }

    const fileKey = `${userAuth.username}/${Date.now()}-${filename}`;

    // Create a multipart upload session
    const uploadUrl = await c.env.PDF_BUCKET.createMultipartUpload(fileKey, {
      httpMetadata: {
        contentType: contentType || "application/pdf",
      },
    });

    return c.json({
      uploadUrl: uploadUrl.uploadId,
      fileKey,
    });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Complete PDF upload
export async function handleCompleteUpload(c: ContextWithAuth) {
  try {
    const fileKey = c.req.param("*");
    const { uploadId, parts } = await c.req.json();

    if (!uploadId || !parts) {
      return c.json({ error: "Upload ID and parts are required" }, 400);
    }

    // Note: R2Bucket doesn't have completeMultipartUpload method
    // This would need to be implemented differently for R2
    console.log("Upload completed for fileKey:", fileKey);

    return c.json({ success: true, fileKey });
  } catch (error) {
    console.error("Error completing upload:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Upload a part of a multipart upload
export async function handleUploadPart(c: ContextWithAuth) {
  try {
    const { fileKey, uploadId, partNumber, file } = await c.req.json();

    if (!fileKey || !uploadId || !partNumber || !file) {
      return c.json(
        { error: "File key, upload ID, part number, and file are required" },
        400
      );
    }

    // Convert the file data back to a buffer
    const fileBuffer = new Uint8Array(file);

    // Upload the part to R2
    await c.env.PDF_BUCKET.put(fileKey, fileBuffer, {
      httpMetadata: {
        contentType: "application/pdf",
      },
    });

    console.log(`Uploaded part ${partNumber} for fileKey:`, fileKey);

    return c.json({
      success: true,
      fileKey,
      partNumber,
    });
  } catch (error) {
    console.error("Error uploading part:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Ingest PDF for processing
export async function handleIngestPdf(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey, filename, description, tags, fileSize } =
      await c.req.json();

    if (!fileKey || !filename) {
      return c.json({ error: "File key and filename are required" }, 400);
    }

    // Verify the fileKey belongs to the authenticated user
    // File keys can be either "username/filename" or "uploads/username/filename"
    if (
      !fileKey.startsWith(`${userAuth.username}/`) &&
      !fileKey.startsWith(`uploads/${userAuth.username}/`)
    ) {
      return c.json({ error: "Access denied to this file" }, 403);
    }

    // Store file metadata in database
    const fileId = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      "INSERT INTO pdf_files (id, file_key, file_name, description, tags, username, status, created_at, file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        fileId,
        fileKey,
        filename,
        description || "",
        tags ? JSON.stringify(tags) : "[]",
        userAuth.username,
        "processing",
        now,
        fileSize || 0
      )
      .run();

    // Start processing in background
    setTimeout(async () => {
      try {
        // Get file from R2
        const file = await c.env.PDF_BUCKET.get(fileKey);
        if (!file) {
          throw new Error("File not found in R2");
        }

        // Process the PDF (simplified for now)
        // Update database status
        await c.env.DB.prepare(
          "UPDATE pdf_files SET status = ?, updated_at = ? WHERE file_key = ?"
        )
          .bind("completed", new Date().toISOString(), fileKey)
          .run();

        completeProgress(fileKey, true);
      } catch (error) {
        console.error("Error processing PDF:", error);
        completeProgress(fileKey, false, (error as Error).message);

        // Update database status
        await c.env.DB.prepare(
          "UPDATE pdf_files SET status = ?, updated_at = ? WHERE file_key = ?"
        )
          .bind("error", new Date().toISOString(), fileKey)
          .run();
      }
    }, 100);

    return c.json({ success: true, fileKey, fileId });
  } catch (error) {
    console.error("Error ingesting PDF:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get PDF files for user
export async function handleGetPdfFiles(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;

    const files = await c.env.DB.prepare(
      "SELECT id, file_key, file_name, description, tags, status, created_at, updated_at FROM pdf_files WHERE username = ? ORDER BY created_at DESC"
    )
      .bind(userAuth.username)
      .all();

    return c.json({ files: files.results || [] });
  } catch (error) {
    console.error("Error fetching PDF files:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Update PDF metadata
export async function handleUpdatePdfMetadata(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey, description, tags } = await c.req.json();

    if (!fileKey) {
      return c.json({ error: "File key is required" }, 400);
    }

    // Verify the fileKey belongs to the authenticated user
    // File keys can be either "username/filename" or "uploads/username/filename"
    if (
      !fileKey.startsWith(`${userAuth.username}/`) &&
      !fileKey.startsWith(`uploads/${userAuth.username}/`)
    ) {
      return c.json({ error: "Access denied to this file" }, 403);
    }

    await c.env.DB.prepare(
      "UPDATE pdf_files SET description = ?, tags = ?, updated_at = ? WHERE file_key = ? AND username = ?"
    )
      .bind(
        description || "",
        tags ? JSON.stringify(tags) : "[]",
        new Date().toISOString(),
        fileKey,
        userAuth.username
      )
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating PDF metadata:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Auto-generate metadata for an existing PDF file
export async function handleAutoGeneratePdfMetadata(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey } = await c.req.json();

    if (!fileKey) {
      return c.json({ error: "File key is required" }, 400);
    }

    // Verify the fileKey belongs to the authenticated user
    if (
      !fileKey.startsWith(`${userAuth.username}/`) &&
      !fileKey.startsWith(`uploads/${userAuth.username}/`)
    ) {
      return c.json({ error: "Access denied to this file" }, 403);
    }

    // Get the file from the database
    const file = await c.env.DB.prepare(
      "SELECT * FROM pdf_files WHERE file_key = ? AND username = ?"
    )
      .bind(fileKey, userAuth.username)
      .first();

    if (!file) {
      return c.json({ error: "File not found" }, 404);
    }

    // Get the file from R2
    const object = await c.env.PDF_BUCKET.get(fileKey);
    if (!object) {
      return c.json({ error: "File not found in storage" }, 404);
    }

    // Process the PDF to extract text and generate metadata
    const ragService = new RAGService(
      c.env.DB,
      c.env.VECTORIZE,
      userAuth.openaiApiKey
    );

    // Create a temporary metadata object for processing
    const tempMetadata = {
      description: "",
      tags: [],
      filename: file.file_name as string,
      file_size: (file.file_size as number) || 0,
      status:
        (file.status as "uploaded" | "processing" | "processed" | "error") ||
        "uploaded",
      created_at: file.created_at as string,
    };

    // Process the PDF to generate metadata
    const processedResult = await ragService.processPdfFromR2(
      fileKey,
      userAuth.username,
      c.env.PDF_BUCKET,
      tempMetadata
    );

    // Extract the suggested metadata
    const suggestedMetadata = processedResult.suggestedMetadata;
    if (!suggestedMetadata) {
      return c.json({ error: "Failed to generate metadata" }, 500);
    }

    // Update the database with the auto-generated metadata
    await c.env.DB.prepare(
      "UPDATE pdf_files SET description = ?, tags = ? WHERE file_key = ? AND username = ?"
    )
      .bind(
        suggestedMetadata.description || "",
        JSON.stringify(suggestedMetadata.tags || []),
        fileKey,
        userAuth.username
      )
      .run();

    return c.json({
      message: "Metadata auto-generated successfully",
      data: {
        fileKey,
        description: suggestedMetadata.description,
        tags: suggestedMetadata.tags,
      },
    });
  } catch (error) {
    console.error("[handleAutoGeneratePdfMetadata] Error:", error);
    return c.json({ error: `Failed to auto-generate metadata: ${error}` }, 500);
  }
}

// Get PDF processing stats
export async function handleGetPdfStats(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;

    // Get status-based stats
    const stats = await c.env.DB.prepare(
      "SELECT status, COUNT(*) as count FROM pdf_files WHERE username = ? GROUP BY status"
    )
      .bind(userAuth.username)
      .all();

    const statsMap = new Map();
    stats.results?.forEach((row: any) => {
      statsMap.set(row.status, row.count);
    });

    // Get file size statistics
    const sizeStats = await c.env.DB.prepare(
      "SELECT SUM(file_size) as total_size, AVG(file_size) as avg_size, COUNT(*) as total_files FROM pdf_files WHERE username = ? AND file_size > 0"
    )
      .bind(userAuth.username)
      .first();

    const totalFiles =
      (statsMap.get("completed") || 0) +
      (statsMap.get("processing") || 0) +
      (statsMap.get("error") || 0) +
      (statsMap.get("uploaded") || 0);

    return c.json({
      username: userAuth.username,
      totalFiles,
      totalSize: sizeStats?.total_size || 0,
      averageFileSize: sizeStats?.avg_size || 0,
      filesByStatus: {
        uploading: 0, // Not tracked in current implementation
        uploaded: statsMap.get("uploaded") || 0,
        parsing: 0, // Not tracked in current implementation
        parsed: statsMap.get("completed") || 0,
        error: statsMap.get("error") || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching PDF stats:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
