import type { Context } from "hono";
import { getDAOFactory } from "@/dao/dao-factory";
import { FileDAO } from "@/dao/file-dao";
import {
  notifyIndexingStarted,
  notifyIndexingCompleted,
  notifyIndexingFailed,
  notifyFileUploadCompleteWithData,
  notifyFileStatusUpdated,
  notifyFileIndexingStatus,
} from "@/lib/notifications";
import { LibraryRAGService } from "@/services/rag/rag-service";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { completeProgress } from "@/services/core/progress-service";
import { SyncQueueService } from "@/services/file/sync-queue-service";
import { FileNotFoundError } from "@/lib/errors";
import { extractJwtFromContext } from "@/lib/auth-utils";

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

    const ragService = new LibraryRAGService(c.env);
    const results = await ragService.searchContent(
      userAuth.username,
      query,
      limit
    );

    return c.json({
      results: Array.isArray(results) ? results : [],
    });
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
      const file = await c.env.R2.get(fileKey);
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

    // Extract JWT before setTimeout (context may not be available inside)
    const jwt = extractJwtFromContext(c);

    // Start processing in background
    setTimeout(async () => {
      try {
        try {
          await notifyIndexingStarted(c.env, userAuth.username, filename);
        } catch (_e) {}
        // Get file from R2
        const file = await c.env.R2.get(fileKey);
        if (!file) {
          throw new FileNotFoundError(fileKey);
        }

        // Process with RAG service
        console.log(
          `[RAG] File ${filename} uploaded to R2, processing with LibraryRAGService`
        );

        // Update database status and file size - mark as uploaded
        await fileDAO.updateFileRecord(fileKey, "uploaded", file.size);

        // Actually process the file with LibraryRAGService
        const processResult = await SyncQueueService.processFileUpload(
          c.env,
          userAuth.username,
          fileKey,
          filename,
          jwt
        );

        if (!processResult.success) {
          throw new Error(processResult.error || processResult.message);
        }

        // Send notifications
        try {
          // Get the complete file record for the notification
          const fileRecord = await fileDAO.getFileForRag(
            fileKey,
            userAuth.username
          );
          if (fileRecord) {
            await notifyFileUploadCompleteWithData(
              c.env,
              userAuth.username,
              fileRecord
            );
          } else {
            console.error(
              `[RAG] File record not found for upload completion notification: ${fileKey}`
            );
          }
          await notifyIndexingCompleted(c.env, userAuth.username, filename);
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

        try {
          await notifyIndexingFailed(
            c.env,
            userAuth.username,
            filename,
            (error as Error)?.message
          );
        } catch (_e) {}
      }
    }, 100);

    return c.json({ success: true, fileKey, fileId });
  } catch (error) {
    console.error("Error processing file for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Update file metadata for RAG - trigger indexing with LibraryRAGService
export async function handleTriggerIndexing(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey } = await c.req.json();

    console.log(
      `[handleTriggerIndexing] Processing request for fileKey: ${fileKey}`
    );

    if (!fileKey) {
      console.log("[RAG] No fileKey provided, cannot trigger indexing");
      return c.json({
        success: false,
        message: "File key is required to trigger indexing",
      });
    }

    // Check if file exists in database
    const fileDAO = getDAOFactory(c.env).fileDAO;
    const file = await fileDAO.getFileForRag(fileKey, userAuth.username);

    if (!file) {
      console.error(
        `[handleTriggerIndexing] File not found in database: ${fileKey}`
      );
      return c.json({ error: "File not found" }, 404);
    }

    // Check if file exists in R2 storage
    const r2File = await c.env.R2.head(fileKey);
    if (!r2File) {
      console.error(
        `[handleTriggerIndexing] File not found in R2 storage: ${fileKey}`
      );
      return c.json({
        success: false,
        message: "File not found in storage. The file may have been deleted.",
      });
    }

    // Reset status from ERROR to UPLOADED before retrying
    if (file.status === FileDAO.STATUS.ERROR || file.status === "failed") {
      console.log(
        `[handleTriggerIndexing] Resetting file status from ${file.status} to UPLOADED for retry: ${file.file_name}`
      );
      await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.UPLOADED);

      // Send status update notification so UI can update immediately
      try {
        await notifyFileStatusUpdated(
          c.env,
          userAuth.username,
          fileKey,
          file.file_name,
          FileDAO.STATUS.UPLOADED,
          file.file_size || undefined
        );
      } catch (notifyError) {
        console.error(
          `[handleTriggerIndexing] Failed to send status update notification:`,
          notifyError
        );
      }
    }

    // Use sync queue service to handle indexing
    try {
      console.log(
        `[handleTriggerIndexing] Processing file with LibraryRAGService: ${file.file_name}`
      );
      // Extract JWT token from Authorization header
      const jwt = extractJwtFromContext(c);

      // Send status-only notification BEFORE processing starts so UI updates immediately
      // We don't send user-facing notification here to avoid duplicate notifications if processing fails immediately
      try {
        await notifyFileIndexingStatus(
          c.env,
          userAuth.username,
          fileKey,
          file.file_name,
          FileDAO.STATUS.SYNCING,
          {
            visibility: "status-only",
            fileSize: file.file_size || undefined,
          }
        );
      } catch (notifyError) {
        console.error(
          `[handleTriggerIndexing] Failed to send status update:`,
          notifyError
        );
      }

      const result = await SyncQueueService.processFileUpload(
        c.env,
        userAuth.username,
        fileKey,
        file.file_name,
        jwt
      );

      // Send user-facing notification only after processing completes (success or failure)
      if (!result.success) {
        // Processing failed - send user-facing error notification
        try {
          await notifyFileIndexingStatus(
            c.env,
            userAuth.username,
            fileKey,
            file.file_name,
            FileDAO.STATUS.ERROR,
            {
              visibility: "both",
              fileSize: file.file_size || undefined,
              reason: result.error || result.message || "Processing failed",
            }
          );
        } catch (notifyError) {
          console.error(
            `[handleTriggerIndexing] Failed to send error notification:`,
            notifyError
          );
        }
      } else {
        // Processing succeeded - success notification will be sent by the processing pipeline
        // Just send a status update to ensure UI is current
        try {
          await notifyFileIndexingStatus(
            c.env,
            userAuth.username,
            fileKey,
            file.file_name,
            FileDAO.STATUS.COMPLETED,
            {
              visibility: "status-only",
              fileSize: file.file_size || undefined,
            }
          );
        } catch (notifyError) {
          console.error(
            `[handleTriggerIndexing] Failed to send success status update:`,
            notifyError
          );
        }
      }

      return c.json({
        success: result.success,
        message: result.message,
        queued: result.queued,
        isIndexed: result.success && !result.queued,
      });
    } catch (syncError) {
      console.error(
        `[handleTriggerIndexing] Failed to trigger indexing for ${fileKey}:`,
        syncError
      );
      return c.json({
        success: false,
        message: `Failed to trigger indexing: ${syncError instanceof Error ? syncError.message : "Unknown error"}`,
        isIndexed: false,
      });
    }
  } catch (error) {
    console.error("Error triggering indexing:", error);
    return c.json(
      {
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// Get files for RAG
export async function handleGetFilesForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;

    const fileDAO = getDAOFactory(c.env).fileDAO;
    const files = await fileDAO.getFilesForRag(userAuth.username);

    // Metadata updates are handled by LibraryRAGService

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

// Check and update file indexing status
export async function handleCheckFileIndexingStatus(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey } = await c.req.json();

    if (!fileKey) {
      return c.json({ error: "fileKey is required" }, 400);
    }

    const fileDAO = getDAOFactory(c.env).fileDAO;

    // Check if file is indexed
    const { isIndexed, error } = await fileDAO.checkFileIndexingStatus(
      fileKey,
      userAuth.username,
      c.env
    );

    // Update file status based on indexing result
    if (!isIndexed) {
      await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.UNINDEXED);
    } else {
      await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.COMPLETED);
    }

    return c.json({
      success: true,
      fileKey,
      isIndexed,
      error: error || null,
      status: isIndexed ? FileDAO.STATUS.COMPLETED : FileDAO.STATUS.UNINDEXED,
    });
  } catch (error) {
    console.error("Error checking file indexing status:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Bulk check and update file indexing statuses
export async function handleBulkCheckFileIndexingStatus(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;

    const fileDAO = getDAOFactory(c.env).fileDAO;

    // Get all files that might need checking (skip completed files as they're verified indexed)
    const files = await fileDAO.getFilesForRag(userAuth.username);
    const filesToCheck = files.filter(
      (f) =>
        f.status === FileDAO.STATUS.UPLOADED ||
        f.status === FileDAO.STATUS.SYNCING ||
        f.status === FileDAO.STATUS.PROCESSING ||
        f.status === FileDAO.STATUS.INDEXING
    );

    const results = [];
    let unindexedCount = 0;

    for (const file of filesToCheck) {
      try {
        const { isIndexed, error } = await fileDAO.checkFileIndexingStatus(
          file.file_key,
          userAuth.username,
          c.env
        );

        if (!isIndexed) {
          await fileDAO.updateFileRecord(
            file.file_key,
            FileDAO.STATUS.UNINDEXED
          );
          unindexedCount++;
        }

        results.push({
          fileKey: file.file_key,
          fileName: file.file_name,
          isIndexed,
          error: error || null,
        });
      } catch (error) {
        console.error(`Error checking file ${file.file_key}:`, error);
        results.push({
          fileKey: file.file_key,
          fileName: file.file_name,
          isIndexed: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return c.json({
      success: true,
      totalChecked: filesToCheck.length,
      unindexedCount,
      results,
    });
  } catch (error) {
    console.error("Error bulk checking file indexing status:", error);
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
        await fileDAO.deleteFile(fileKey, c.env.R2);
        console.log("[handleDeleteFileForRag] Cleaned up chunks");
      } catch (error) {
        console.log("[handleDeleteFileForRag] Cleanup failed:", error);
      }

      // Try to delete from R2 anyway (in case it still exists)
      try {
        await c.env.R2.delete(fileKey);
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
      await c.env.R2.delete(fileKey);
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
    await fileDAO.deleteFile(fileKey, c.env.R2);
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
