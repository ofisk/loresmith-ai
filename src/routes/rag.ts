import type { Context } from "hono";
import { getDAOFactory } from "../dao/dao-factory";
import { FileDAO } from "../dao/file-dao";
import {
  notifyIndexingStarted,
  notifyIndexingCompleted,
  notifyIndexingFailed,
  notifyFileUploadCompleteWithData,
} from "../lib/notifications";
import { getLibraryAutoRAGService } from "../lib/service-factory";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import { completeProgress } from "../services/progress-service";
import { SyncQueueService } from "../services/sync-queue-service";

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

    const ragService = getLibraryAutoRAGService(c.env, userAuth.username);
    const results = await ragService.aiSearch(query, { max_results: limit });

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

    // Start processing in background
    setTimeout(async () => {
      try {
        try {
          await notifyIndexingStarted(c.env, userAuth.username, filename);
        } catch (_e) {}
        // Get file from R2
        const file = await c.env.R2.get(fileKey);
        if (!file) {
          throw new Error("File not found in R2");
        }

        // Process with RAG service
        console.log(
          `[RAG] File ${filename} uploaded to R2, AutoRAG will process it`
        );

        // Update database status and file size - mark as uploaded, not completed
        await fileDAO.updateFileRecord(fileKey, "uploaded", file.size);

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
      const file = await c.env.R2.get(fileKey);
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
        try {
          await notifyIndexingStarted(c.env, userAuth.username, filename);
        } catch (_e) {}
        // Get file from R2
        const file = await c.env.R2.get(fileKey);
        if (!file) {
          throw new Error("File not found in R2");
        }

        // Process with RAG service
        // AutoRAG will process files from R2, but it takes time
        console.log(
          `[RAG] File ${filename} uploaded to R2, AutoRAG will process it`
        );

        // Update database status and file size - mark as uploaded, not completed
        await fileDAO.updateFileRecord(fileKey, "uploaded", file.size);

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
        console.error("Error processing file from R2 for RAG:", error);
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
    console.error("Error processing file from R2 for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Update file metadata for RAG
export async function handleTriggerAutoRAGIndexing(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey } = await c.req.json();

    console.log(
      `[handleTriggerAutoRAGIndexing] Processing request for fileKey: ${fileKey}`
    );

    if (fileKey) {
      // Check if file exists
      const fileDAO = getDAOFactory(c.env).fileDAO;
      const file = await fileDAO.getFileForRag(fileKey, userAuth.username);

      if (!file) {
        return c.json({ error: "File not found" }, 404);
      }

      // Use sync queue service to handle AutoRAG sync intelligently
      try {
        console.log(
          `[handleTriggerAutoRAGIndexing] Processing retry with sync queue for file: ${file.file_name}`
        );
        // Extract JWT token from Authorization header
        const authHeader = c.req.header("Authorization");
        const jwt = authHeader?.replace(/^Bearer\s+/i, "");

        const result = await SyncQueueService.processFileUpload(
          c.env,
          userAuth.username,
          fileKey,
          file.file_name,
          jwt
        );

        if (result.queued) {
          console.log(
            `[handleTriggerAutoRAGIndexing] File queued for retry: ${file.file_name}`
          );

          // Send notification that indexing will start soon (queued)
          try {
            await notifyIndexingStarted(
              c.env,
              userAuth.username,
              file.file_name
            );
          } catch (notifyError) {
            console.error(
              `[handleTriggerAutoRAGIndexing] Failed to send indexing started notification:`,
              notifyError
            );
          }

          return c.json({
            success: true,
            message: `File ${file.file_name} queued for retry (sync in progress).`,
            queued: true,
            isIndexed: false,
          });
        } else {
          console.log(
            `[handleTriggerAutoRAGIndexing] Retry triggered immediately, job: ${result.jobId}`
          );

          // Send immediate notification that indexing has started
          try {
            await notifyIndexingStarted(
              c.env,
              userAuth.username,
              file.file_name
            );
          } catch (notifyError) {
            console.error(
              `[handleTriggerAutoRAGIndexing] Failed to send indexing started notification:`,
              notifyError
            );
          }

          return c.json({
            success: true,
            message: `File ${file.file_name} retry started immediately. AutoRAG job ${result.jobId} is being tracked.`,
            jobId: result.jobId,
            queued: false,
            isIndexed: false,
          });
        }
      } catch (syncError) {
        console.error(
          `[handleTriggerAutoRAGIndexing] Failed to trigger AutoRAG sync for ${fileKey}:`,
          syncError
        );
        return c.json({
          success: false,
          message: `Failed to trigger indexing: ${syncError instanceof Error ? syncError.message : "Unknown error"}`,
          isIndexed: false,
        });
      }
    } else {
      // AutoRAG automatically handles indexing from R2 bucket
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

    // Metadata updates are now handled by AutoRAG automatically

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

// Check and update file indexing status
export async function handleCheckFileIndexingStatus(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey } = await c.req.json();

    if (!fileKey) {
      return c.json({ error: "fileKey is required" }, 400);
    }

    const fileDAO = getDAOFactory(c.env).fileDAO;
    const ragService = getLibraryAutoRAGService(c.env, userAuth.username);

    // Check if file is indexed
    const { isIndexed, error } = await fileDAO.checkFileIndexingStatus(
      fileKey,
      userAuth.username,
      ragService
    );

    // Update file status based on indexing result
    if (!isIndexed) {
      await fileDAO.updateFileAutoRAGStatus(
        fileKey,
        userAuth.username,
        FileDAO.STATUS.UNINDEXED
      );
    } else {
      await fileDAO.updateFileAutoRAGStatus(
        fileKey,
        userAuth.username,
        FileDAO.STATUS.COMPLETED
      );
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
    const ragService = getLibraryAutoRAGService(c.env, userAuth.username);

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
          ragService
        );

        if (!isIndexed) {
          await fileDAO.updateFileAutoRAGStatus(
            file.file_key,
            userAuth.username,
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
