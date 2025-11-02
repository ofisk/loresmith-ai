/**
 * Upload notification helpers
 * Extracted from upload.ts to separate notification concerns
 */

import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";
import {
  notifyFileStatusUpdated,
  notifyFileUpdated,
  notifyFileUploadCompleteWithData,
  notifyIndexingCompleted,
} from "@/lib/notifications";
import { logger, type ScopedLogger } from "@/lib/logger";

/**
 * Send all notifications for a completed file upload
 */
export async function sendUploadCompleteNotifications(
  env: Env,
  userId: string,
  fileKey: string,
  filename: string,
  scopedLog?: ScopedLogger
): Promise<void> {
  const log = scopedLog || logger.scope("[UploadNotifications]");
  // Fetch file record for detailed notifications
  const fileDAO = getDAOFactory(env).fileDAO;
  const fileRecord = await fileDAO.getFileForRag(fileKey, userId);

  if (fileRecord) {
    log.debug("File record found, sending detailed notifications", {
      id: fileRecord.id,
      status: fileRecord.status,
    });

    // Send file updated notification
    notifyFileUpdated(env, userId, fileRecord).catch((error) => {
      log.error("File updated notification failed", error);
    });

    // Send upload complete notification
    notifyFileUploadCompleteWithData(env, userId, fileRecord).catch((error) => {
      log.error("Upload complete notification failed", error);
    });
  } else {
    log.debug("File record not found, using fallback notification");
    // Fallback to basic status notification
    const r2Meta = await env.R2.head(fileKey).catch(() => null);
    notifyFileStatusUpdated(
      env,
      userId,
      fileKey,
      filename,
      "uploaded",
      r2Meta?.size || 0
    ).catch((error) => {
      log.error("Status notification failed", error);
    });
  }

  // Send indexing completed notification (fire-and-forget)
  log.debug("Sending indexing completed notification");
  notifyIndexingCompleted(env, userId, filename).catch((error) => {
    log.error("Indexing completed notification failed", error);
  });
}
