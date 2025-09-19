import type { Context } from "hono";
import { getDAOFactory } from "../dao/dao-factory";
import { FileDAO } from "../dao/file-dao";
import { notifyFileUploadComplete } from "../lib/notifications";
import { getLibraryRagService } from "../lib/service-factory";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import { completeProgress } from "../services/progress-service";

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

    const ragService = getLibraryRagService(c.env);
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

// Process file for RAG
export async function handleProcessFileForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey, filename, description, tags } = await c.req.json();

    if (!fileKey || !filename) {
      return c.json({ error: "File key and filename are required" }, 400);
    }

    // Store file metadata in database
    const fileId = crypto.randomUUID();

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

    const fileDAO = getDAOFactory(c.env).fileDAO;
    await fileDAO.createFileRecord(
      fileId,
      fileKey,
      filename,
      description || "",
      tags ? JSON.stringify(tags) : "[]",
      userAuth.username,
      "processing",
      fileSize
    );

    // Start processing in background
    setTimeout(async () => {
      try {
        // Get file from R2
        const file = await c.env.FILE_BUCKET.get(fileKey);
        if (!file) {
          throw new Error("File not found in R2");
        }

        // Process with RAG service
        const ragService = getLibraryRagService(c.env);
        await ragService.processFileFromR2(
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
        await fileDAO.updateFileRecord(fileKey, "completed", file.size);

        // Send notification about file upload completion
        try {
          await notifyFileUploadComplete(
            c.env,
            userAuth.username,
            filename,
            file.size
          );
        } catch (error) {
          console.error(
            "[RAG] Failed to send file upload notification:",
            error
          );
        }

        completeProgress(fileKey, true);
      } catch (error) {
        console.error("Error processing file for RAG:", error);
        completeProgress(fileKey, false, (error as Error).message);

        // Update database status
        await fileDAO.updateFileRecord(fileKey, "error");
      }
    }, 100);

    return c.json({ success: true, fileKey, fileId });
  } catch (error) {
    console.error("Error processing file for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Process file from R2 for RAG
export async function handleProcessFileFromR2ForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey, filename, description, tags } = await c.req.json();

    if (!fileKey || !filename) {
      return c.json({ error: "File key and filename are required" }, 400);
    }

    // Store file metadata in database
    const fileId = crypto.randomUUID();

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

    const fileDAO = getDAOFactory(c.env).fileDAO;
    await fileDAO.createFileRecord(
      fileId,
      fileKey,
      filename,
      description || "",
      tags ? JSON.stringify(tags) : "[]",
      userAuth.username,
      "processing",
      fileSize
    );

    // Start processing in background
    setTimeout(async () => {
      try {
        // Get file from R2
        const file = await c.env.FILE_BUCKET.get(fileKey);
        if (!file) {
          throw new Error("File not found in R2");
        }

        // Process with RAG service
        const ragService = getLibraryRagService(c.env);
        await ragService.processFileFromR2(
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
        await fileDAO.updateFileRecord(fileKey, "completed", file.size);

        // Send notification about file upload completion
        try {
          await notifyFileUploadComplete(
            c.env,
            userAuth.username,
            filename,
            file.size
          );
        } catch (error) {
          console.error(
            "[RAG] Failed to send file upload notification:",
            error
          );
        }

        completeProgress(fileKey, true);
      } catch (error) {
        console.error("Error processing file from R2 for RAG:", error);
        completeProgress(fileKey, false, (error as Error).message);

        // Update database status
        await fileDAO.updateFileRecord(fileKey, "error");
      }
    }, 100);

    return c.json({ success: true, fileKey, fileId });
  } catch (error) {
    console.error("Error processing file from R2 for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Update file metadata for RAG
export async function handleTriggerAutoRAGIndexing(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey } = await c.req.json();

    if (fileKey) {
      // Process specific file
      const ragService = getLibraryRagService(c.env);

      // Get file metadata
      const fileDAO = getDAOFactory(c.env).fileDAO;
      const file = await fileDAO.getFileForRag(fileKey, userAuth.username);

      if (!file) {
        return c.json({ error: "File not found" }, 404);
      }

      // Run processing in background
      setTimeout(async () => {
        try {
          await ragService.processFileFromR2(
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

// Get files for RAG
export async function handleGetFilesForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;

    const fileDAO = getDAOFactory(c.env).fileDAO;
    const files = await fileDAO.getFilesForRag(userAuth.username);

    // Check for metadata updates from LibraryRAG
    const ragService = getLibraryRagService(c.env);
    await ragService.getUserFiles(userAuth.username); // This will trigger metadata updates

    return c.json({ files });
  } catch (error) {
    console.error("Error fetching files for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get file chunks for RAG
export async function handleGetFileChunksForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const fileKey = c.req.param("fileKey");

    const fileDAO = getDAOFactory(c.env).fileDAO;
    const chunks = await fileDAO.getFileChunksForRag(
      fileKey,
      userAuth.username
    );

    return c.json({ chunks });
  } catch (error) {
    console.error("Error fetching file chunks for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Check AutoRAG indexing status and update metadata
export async function handleCheckAutoRAGStatus(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;

    const fileDAO = getDAOFactory(c.env).fileDAO;
    const stats = await fileDAO.getFileStatsForRag(userAuth.username);

    return c.json({
      success: true,
      ...stats,
      message:
        stats.uploaded > 0
          ? `${stats.uploaded} files uploaded and waiting for AutoRAG indexing`
          : stats.processed > 0
            ? "All files have been indexed and processed"
            : "No files found",
    });
  } catch (error) {
    console.error("Error checking AutoRAG status:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export const handleDeleteFileForRag = async (c: any) => {
  try {
    const userAuth = (c as any).userAuth;
    const fileKey = c.req.param("fileKey");
    console.log("[handleDeleteFileForRag] Starting deletion process");
    console.log("[handleDeleteFileForRag] Received fileKey:", fileKey);
    console.log("[handleDeleteFileForRag] User:", userAuth.username);
    console.log("[handleDeleteFileForRag] Request URL:", c.req.url);
    console.log("[handleDeleteFileForRag] Request path:", c.req.path);

    if (!fileKey) {
      console.error("[handleDeleteFileForRag] No fileKey provided");
      return c.json({ error: "No file key provided" }, 400);
    }

    // Initialize DAO
    const fileDAO = new FileDAO(c.env.DB);

    // Check if file exists before deletion
    const existingFile = await fileDAO.getFileMetadata(fileKey);

    console.log("[handleDeleteFileForRag] Existing file check:", existingFile);

    // If file doesn't exist in database, try to clean up any remaining chunks
    if (!existingFile) {
      console.log(
        "[handleDeleteFileForRag] File not found in database, cleaning up chunks"
      );

      // Delete any remaining chunks from database
      try {
        await fileDAO.deleteFile(fileKey, c.env.FILE_BUCKET);
        console.log("[handleDeleteFileForRag] Cleaned up chunks");
      } catch (error) {
        console.log("[handleDeleteFileForRag] Cleanup failed:", error);
      }

      // Try to delete from R2 anyway (in case it still exists)
      try {
        await c.env.FILE_BUCKET.delete(fileKey);
        console.log("[handleDeleteFileForRag] R2 cleanup completed");
      } catch (error) {
        console.log(
          "[handleDeleteFileForRag] R2 cleanup failed (file may not exist):",
          error
        );
      }

      return c.json({
        success: true,
        message: "File was already deleted or cleaned up",
      });
    }

    console.log("[handleDeleteFileForRag] Deleting from R2 bucket:", fileKey);
    // Delete from R2 - handle failures gracefully
    try {
      await c.env.FILE_BUCKET.delete(fileKey);
      console.log("[handleDeleteFileForRag] R2 deletion completed");
    } catch (error) {
      console.log(
        "[handleDeleteFileForRag] R2 deletion failed (file may not exist):",
        error
      );
      // Continue with database cleanup even if R2 deletion fails
    }

    console.log("[handleDeleteFileForRag] Deleting from database using DAO");
    // Delete all related data using DAO
    await fileDAO.deleteFile(fileKey, c.env.FILE_BUCKET);
    console.log("[handleDeleteFileForRag] Database deletion completed");

    // Verify deletion
    const verifyFile = await fileDAO.getFileMetadata(fileKey);

    console.log("[handleDeleteFileForRag] Verification check:", verifyFile);

    if (verifyFile) {
      console.error(
        "[handleDeleteFileForRag] File still exists after deletion!"
      );
      return c.json({ error: "File deletion failed" }, 500);
    }

    console.log("[handleDeleteFileForRag] Deletion successful");
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting file for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
};
