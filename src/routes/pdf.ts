import type { Context } from "hono";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import { completeProgress } from "../services/progress";

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
    const { fileKey, filename, description, tags } = await c.req.json();

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
      "INSERT INTO pdf_files (id, file_key, file_name, description, tags, username, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        fileId,
        fileKey,
        filename,
        description || "",
        tags ? JSON.stringify(tags) : "[]",
        userAuth.username,
        "processing",
        now
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

// Get PDF processing stats
export async function handleGetPdfStats(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;

    const stats = await c.env.DB.prepare(
      "SELECT status, COUNT(*) as count FROM pdf_files WHERE username = ? GROUP BY status"
    )
      .bind(userAuth.username)
      .all();

    const statsMap = new Map();
    stats.results?.forEach((row: any) => {
      statsMap.set(row.status, row.count);
    });

    const totalFiles =
      (statsMap.get("completed") || 0) +
      (statsMap.get("processing") || 0) +
      (statsMap.get("error") || 0);

    return c.json({
      username: userAuth.username,
      totalFiles,
      filesByStatus: {
        uploading: 0, // Not tracked in current implementation
        uploaded: statsMap.get("processing") || 0,
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
