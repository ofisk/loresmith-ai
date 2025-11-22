/**
 * Upload processing logic
 * Extracted from upload.ts to reduce complexity and improve maintainability
 */

import { getDAOFactory } from "@/dao/dao-factory";
import { FileDAO } from "@/dao/file-dao";
import { logger, type ScopedLogger } from "@/lib/logger";
import type { Env } from "@/middleware/auth";
import { SyncQueueService } from "@/services/file/sync-queue-service";

/**
 * Process a file with LibraryRAGService and update status
 */
export async function processFileWithAutoRAG(
  env: Env,
  fileKey: string,
  userId: string,
  filename: string,
  logPrefix: string,
  jwt?: string
): Promise<void> {
  const scopedLog = logger.scope(logPrefix);

  return scopedLog.operation("FILE PROCESSING", async () => {
    scopedLog.debug("Starting file processing", {
      file: filename,
      fileKey,
      user: userId,
      jwtPresent: !!jwt,
    });

    const fileDAO = getDAOFactory(env).fileDAO;

    // Mark as SYNCING immediately for UI responsiveness
    await markFileAsSyncing(env, fileKey, userId, filename, fileDAO, scopedLog);

    // Check file existence (non-blocking)
    await checkFileExistence(env, fileKey, scopedLog);

    // Send indexing started notification
    const { notifyIndexingStarted } = await import("../lib/notifications");
    notifyIndexingStarted(env, userId, filename).catch((error) => {
      scopedLog.error("Indexing started notification failed", error);
    });

    // Update database status to UPLOADED
    await updateFileStatusToUploaded(env, fileKey, fileDAO, scopedLog);

    // Trigger file indexing with LibraryRAGService
    const result = await SyncQueueService.processFileUpload(
      env,
      userId,
      fileKey,
      filename,
      jwt
    );

    scopedLog.debug("File processing initiated", { result });

    // Force SYNCING state for UI responsiveness
    await markFileAsSyncing(env, fileKey, userId, filename, fileDAO, scopedLog);

    // Send completion notifications (imported function only takes 4 params)
    const { sendUploadCompleteNotifications: sendNotifications } = await import(
      "./upload-notifications"
    );
    await sendNotifications(env, userId, fileKey, filename);
  });
}

/**
 * Mark file as SYNCING status
 */
async function markFileAsSyncing(
  env: Env,
  fileKey: string,
  userId: string,
  filename: string,
  fileDAO: FileDAO,
  scopedLog: ScopedLogger
): Promise<void> {
  try {
    await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.SYNCING);
    const headMeta = await env.R2.head(fileKey).catch(() => null);

    // Import notification functions dynamically to avoid circular dependencies
    const { notifyFileStatusUpdated } = await import("@/lib/notifications");
    await notifyFileStatusUpdated(
      env,
      userId,
      fileKey,
      filename,
      FileDAO.STATUS.SYNCING,
      headMeta?.size || 0
    );

    scopedLog.debug("Status set to SYNCING", { size: headMeta?.size || 0 });
  } catch (error) {
    scopedLog.warn("Failed to mark file as SYNCING (non-fatal)", { error });
  }
}

/**
 * Check file existence in R2 (non-blocking)
 */
async function checkFileExistence(
  env: Env,
  fileKey: string,
  scopedLog: ScopedLogger
): Promise<void> {
  try {
    const head = await env.R2.head(fileKey);
    if (head) {
      scopedLog.debug("File present in R2", { size: head.size });
    } else {
      scopedLog.warn("R2 HEAD returned null", { fileKey });
    }
  } catch (error) {
    scopedLog.warn("R2 HEAD check failed (continuing)", { error });
  }
}

/**
 * Update file status to UPLOADED in database
 */
async function updateFileStatusToUploaded(
  env: Env,
  fileKey: string,
  fileDAO: FileDAO,
  scopedLog: ScopedLogger
): Promise<void> {
  const r2Meta = await env.R2.head(fileKey).catch(() => null);
  scopedLog.debug("Updating database status to UPLOADED", {
    size: r2Meta?.size || 0,
  });

  await fileDAO.updateFileRecord(
    fileKey,
    FileDAO.STATUS.UPLOADED,
    r2Meta?.size || 0
  );

  scopedLog.debug("File marked as UPLOADED in database");
}

/**
 * Start file processing in background
 */
export async function startAutoRAGProcessing(
  env: Env,
  fileKey: string,
  userId: string,
  filename: string,
  logPrefix: string,
  jwt?: string
): Promise<void> {
  const scopedLog = logger.scope(logPrefix);
  scopedLog.debug("Starting file processing in background", { filename });

  try {
    await processFileWithAutoRAG(
      env,
      fileKey,
      userId,
      filename,
      logPrefix,
      jwt
    );
  } catch (error) {
    scopedLog.error("File processing failed", error);
    await handleProcessingError(
      env,
      fileKey,
      userId,
      filename,
      error,
      scopedLog
    );
    throw error;
  }
}

/**
 * Handle processing errors
 */
async function handleProcessingError(
  env: Env,
  fileKey: string,
  userId: string,
  filename: string,
  error: unknown,
  scopedLog: ScopedLogger
): Promise<void> {
  const fileDAO = getDAOFactory(env).fileDAO;

  // Update file status to ERROR
  await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.ERROR);
  scopedLog.debug("File status updated to ERROR");

  // Send error notifications (fire-and-forget)
  const { notifyFileStatusUpdated, notifyIndexingFailed } = await import(
    "@/lib/notifications"
  );

  notifyFileStatusUpdated(
    env,
    userId,
    fileKey,
    filename,
    FileDAO.STATUS.ERROR
  ).catch((notifyError) => {
    scopedLog.error("Error status notification failed", notifyError);
  });

  notifyIndexingFailed(
    env,
    userId,
    filename,
    error instanceof Error ? error.message : String(error)
  ).catch((notifyError) => {
    scopedLog.error("Indexing failed notification failed", notifyError);
  });
}
