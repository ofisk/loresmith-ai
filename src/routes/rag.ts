import type { Context } from "hono";
import { getAutoRAGService } from "../services/service-factory";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import { completeProgress } from "../services/progress";

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

// Search RAG index
export async function handleRagSearch(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { query, limit = 10 } = await c.req.json();

    if (!query) {
      return c.json({ error: "Query is required" }, 400);
    }

    const ragService = getAutoRAGService(c.env);
    const results = await ragService.searchContent(
      userAuth.username,
      query,
      limit
    );

    return c.json({ results });
  } catch (error) {
    console.error("Error searching RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Process PDF for RAG
export async function handleProcessPdfForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey, filename, description, tags } = await c.req.json();

    if (!fileKey || !filename) {
      return c.json({ error: "File key and filename are required" }, 400);
    }

    // Store file metadata in database
    const fileId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Get file size from R2
    let fileSize = 0;
    try {
      console.log(`[RAG] Attempting to get file from R2: ${fileKey}`);
      const file = await c.env.FILE_BUCKET.get(fileKey);
      if (file) {
        fileSize = file.size;
        console.log(`[RAG] File found in R2, size: ${fileSize} bytes`);
      } else {
        console.log(`[RAG] File not found in R2: ${fileKey}`);
      }
    } catch (error) {
      console.warn("Could not get file size from R2:", error);
    }

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
        fileSize
      )
      .run();

    // Start processing in background
    setTimeout(async () => {
      try {
        // Get file from R2
        const file = await c.env.FILE_BUCKET.get(fileKey);
        if (!file) {
          throw new Error("File not found in R2");
        }

        // Process with RAG service
        const ragService = getAutoRAGService(c.env);
        await ragService.processPdfFromR2(
          fileKey,
          userAuth.username,
          c.env.FILE_BUCKET,
          {
            file_key: fileKey,
            username: userAuth.username,
            file_name: filename,
            file_size: file.size,
            status: "processing",
            created_at: new Date().toISOString(),
          }
        );

        // Update database status and file size
        await c.env.DB.prepare(
          "UPDATE pdf_files SET status = ?, updated_at = ?, file_size = ? WHERE file_key = ?"
        )
          .bind("completed", new Date().toISOString(), file.size, fileKey)
          .run();

        completeProgress(fileKey, true);
      } catch (error) {
        console.error("Error processing PDF for RAG:", error);
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
    console.error("Error processing PDF for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Process PDF from R2 for RAG
export async function handleProcessPdfFromR2ForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey, filename, description, tags } = await c.req.json();

    if (!fileKey || !filename) {
      return c.json({ error: "File key and filename are required" }, 400);
    }

    // Store file metadata in database
    const fileId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Get file size from R2
    let fileSize = 0;
    try {
      const file = await c.env.FILE_BUCKET.get(fileKey);
      if (file) {
        fileSize = file.size;
      }
    } catch (error) {
      console.warn("Could not get file size from R2:", error);
    }

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
        fileSize
      )
      .run();

    // Start processing in background
    setTimeout(async () => {
      try {
        // Get file from R2
        const file = await c.env.FILE_BUCKET.get(fileKey);
        if (!file) {
          throw new Error("File not found in R2");
        }

        // Process with RAG service
        const ragService = getAutoRAGService(c.env);
        await ragService.processPdfFromR2(
          fileKey,
          userAuth.username,
          c.env.FILE_BUCKET,
          {
            file_key: fileKey,
            username: userAuth.username,
            file_name: filename,
            file_size: file.size,
            status: "processing",
            created_at: new Date().toISOString(),
          }
        );

        // Update database status and file size
        await c.env.DB.prepare(
          "UPDATE pdf_files SET status = ?, updated_at = ?, file_size = ? WHERE file_key = ?"
        )
          .bind("completed", new Date().toISOString(), file.size, fileKey)
          .run();

        completeProgress(fileKey, true);
      } catch (error) {
        console.error("Error processing PDF from R2 for RAG:", error);
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
    console.error("Error processing PDF from R2 for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Update PDF metadata for RAG
export async function handleTriggerAutoRAGIndexing(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey } = await c.req.json();

    if (fileKey) {
      // Process specific file
      const ragService = getAutoRAGService(c.env);

      // Get file metadata
      const file = await c.env.DB.prepare(
        "SELECT * FROM pdf_files WHERE file_key = ? AND username = ?"
      )
        .bind(fileKey, userAuth.username)
        .first();

      if (!file) {
        return c.json({ error: "File not found" }, 404);
      }

      // Run processing in background
      setTimeout(async () => {
        try {
          await ragService.processPdfFromR2(
            fileKey,
            userAuth.username,
            c.env.FILE_BUCKET,
            {
              file_key: fileKey,
              username: userAuth.username,
              file_name: file.file_name as string,
              file_size: file.file_size as number,
              status: "processing",
              created_at: file.created_at as string,
            }
          );
          console.log(`[AutoRAG] Manual processing completed for ${fileKey}`);
        } catch (error) {
          console.error(
            `[AutoRAG] Manual processing failed for ${fileKey}:`,
            error
          );
        }
      }, 100);

      return c.json({
        success: true,
        message: `AutoRAG processing triggered for ${fileKey}`,
      });
    } else {
      // AutoRAG automatically handles indexing from R2 bucket
      // No manual bulk processing needed
      console.log("[RAG] AutoRAG automatically indexes content from R2 bucket");

      return c.json({
        success: true,
        message: "AutoRAG indexing is automatic - no manual trigger needed",
      });
    }
  } catch (error) {
    console.error("Error triggering AutoRAG indexing:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function handleUpdatePdfMetadataForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const fileKey = c.req.param("fileKey");
    const { description, tags } = await c.req.json();

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
    console.error("Error updating PDF metadata for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get PDF files for RAG
export async function handleGetPdfFilesForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;

    const files = await c.env.DB.prepare(
      "SELECT id, file_key, file_name, description, tags, status, created_at, updated_at, file_size FROM pdf_files WHERE username = ? ORDER BY created_at DESC"
    )
      .bind(userAuth.username)
      .all();

    // Check for metadata updates from AutoRAG
    const autoRagService = getAutoRAGService(c.env);
    await autoRagService.getUserPdfs(userAuth.username); // This will trigger metadata updates

    return c.json({ files: files.results || [] });
  } catch (error) {
    console.error("Error fetching PDF files for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get PDF chunks for RAG
export async function handleGetPdfChunksForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const fileKey = c.req.param("fileKey");

    const chunks = await c.env.DB.prepare(
      "SELECT id, file_key, chunk_text, chunk_index, created_at FROM pdf_chunks WHERE file_key = ? AND username = ? ORDER BY chunk_index"
    )
      .bind(fileKey, userAuth.username)
      .all();

    return c.json({ chunks: chunks.results || [] });
  } catch (error) {
    console.error("Error fetching PDF chunks for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Check AutoRAG indexing status and update metadata
export async function handleCheckAutoRAGStatus(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const autoRagService = getAutoRAGService(c.env);

    // Get files and trigger metadata updates
    const files = await autoRagService.getUserPdfs(userAuth.username);

    // Count files by status
    const uploaded = files.filter((f) => f.status === "uploaded").length;
    const processed = files.filter((f) => f.status === "processed").length;
    const processing = files.filter((f) => f.status === "processing").length;
    const error = files.filter((f) => f.status === "error").length;

    return c.json({
      success: true,
      uploaded,
      processed,
      processing,
      error,
      total: files.length,
      message:
        uploaded > 0
          ? `${uploaded} files uploaded and waiting for AutoRAG indexing`
          : processed > 0
            ? "All files have been indexed and processed"
            : "No files found",
    });
  } catch (error) {
    console.error("Error checking AutoRAG status:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Delete PDF for RAG
export async function handleDeletePdfForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const fileKey = c.req.param("fileKey");
    console.log("[handleDeletePdfForRag] Starting deletion process");
    console.log("[handleDeletePdfForRag] Received fileKey:", fileKey);
    console.log("[handleDeletePdfForRag] User:", userAuth.username);
    console.log("[handleDeletePdfForRag] Request URL:", c.req.url);
    console.log("[handleDeletePdfForRag] Request path:", c.req.path);

    if (!fileKey) {
      console.error("[handleDeletePdfForRag] No fileKey provided");
      return c.json({ error: "No file key provided" }, 400);
    }

    // Check if file exists before deletion
    const existingFile = await c.env.DB.prepare(
      "SELECT file_key, file_name FROM pdf_files WHERE file_key = ? AND username = ?"
    )
      .bind(fileKey, userAuth.username)
      .first();

    console.log("[handleDeletePdfForRag] Existing file check:", existingFile);

    // If file doesn't exist in database, try to clean up any remaining chunks
    if (!existingFile) {
      console.log(
        "[handleDeletePdfForRag] File not found in database, cleaning up chunks"
      );

      // Delete any remaining chunks from database
      const chunksResult = await c.env.DB.prepare(
        "DELETE FROM pdf_chunks WHERE file_key = ? AND username = ?"
      )
        .bind(fileKey, userAuth.username)
        .run();
      console.log("[handleDeletePdfForRag] Cleaned up chunks:", chunksResult);

      // Try to delete from R2 anyway (in case it still exists)
      try {
        await c.env.FILE_BUCKET.delete(fileKey);
        console.log("[handleDeletePdfForRag] R2 cleanup completed");
      } catch (error) {
        console.log(
          "[handleDeletePdfForRag] R2 cleanup failed (file may not exist):",
          error
        );
      }

      return c.json({
        success: true,
        message: "File was already deleted or cleaned up",
      });
    }

    console.log("[handleDeletePdfForRag] Deleting from R2 bucket:", fileKey);
    // Delete from R2
    await c.env.FILE_BUCKET.delete(fileKey);
    console.log("[handleDeletePdfForRag] R2 deletion completed");

    console.log("[handleDeletePdfForRag] Deleting chunks from database");
    // Delete chunks from database
    const chunksResult = await c.env.DB.prepare(
      "DELETE FROM pdf_chunks WHERE file_key = ? AND username = ?"
    )
      .bind(fileKey, userAuth.username)
      .run();
    console.log("[handleDeletePdfForRag] Chunks deleted:", chunksResult);

    console.log("[handleDeletePdfForRag] Deleting file metadata from database");
    // Delete file metadata from database
    const fileResult = await c.env.DB.prepare(
      "DELETE FROM pdf_files WHERE file_key = ? AND username = ?"
    )
      .bind(fileKey, userAuth.username)
      .run();
    console.log("[handleDeletePdfForRag] File metadata deleted:", fileResult);

    // Verify deletion
    const verifyFile = await c.env.DB.prepare(
      "SELECT file_key FROM pdf_files WHERE file_key = ? AND username = ?"
    )
      .bind(fileKey, userAuth.username)
      .first();

    console.log("[handleDeletePdfForRag] Verification check:", verifyFile);

    if (verifyFile) {
      console.error(
        "[handleDeletePdfForRag] File still exists after deletion!"
      );
      return c.json({ error: "File deletion failed" }, 500);
    }

    console.log("[handleDeletePdfForRag] Deletion successful");
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting PDF for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
