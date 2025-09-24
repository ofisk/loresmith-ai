// Sync Queue Service for managing AutoRAG sync operations
// This service ensures only one sync runs at a time per user and queues additional requests

import { FileDAO } from "../dao/file-dao";
import { AutoRAGService } from "./autorag-service";
import { AUTORAG_CONFIG } from "../shared-config";

export class SyncQueueService {
  /**
   * Process a file upload - either trigger sync immediately or queue it
   */
  static async processFileUpload(
    env: any,
    username: string,
    fileKey: string,
    fileName: string,
    jwt?: string
  ): Promise<{ queued: boolean; jobId?: string; message: string }> {
    console.log(
      `[SyncQueue] processFileUpload called for ${fileName} (${fileKey})`
    );
    const fileDAO = new FileDAO(env.DB);
    const ragId = AUTORAG_CONFIG.LIBRARY_RAG_ID;
    console.log(`[SyncQueue] Using ragId: ${ragId}`);

    // Check if there are any ongoing AutoRAG jobs for this user
    console.log(`[SyncQueue] Checking for ongoing jobs for user: ${username}`);
    const hasOngoingJobs = await fileDAO.hasOngoingAutoRAGJobs(username);
    console.log(`[SyncQueue] Has ongoing jobs: ${hasOngoingJobs}`);

    if (hasOngoingJobs) {
      // Queue via Durable Object if a job is already in progress
      const queueResult = await SyncQueueService.queueFileForSync(
        env,
        username,
        fileKey,
        fileName,
        ragId
      );

      console.log(
        `[SyncQueue] File ${fileName} ${queueResult.queued ? "queued" : "processing immediately"} for user ${username}`
      );

      return {
        queued: queueResult.queued,
        message: queueResult.queued
          ? `File ${fileName} queued for indexing (sync in progress)`
          : `File ${fileName} indexing started immediately`,
      };
    } else {
      // No ongoing jobs, trigger sync immediately
      try {
        console.log(
          `[SyncQueue] No ongoing jobs, triggering immediate sync for ${fileName}`
        );
        const jobId = await AutoRAGService.triggerSync(ragId, 0, jwt, env);
        console.log(`[SyncQueue] AutoRAG sync triggered, jobId: ${jobId}`);

        // Store the job for tracking
        await fileDAO.createAutoRAGJob(
          jobId,
          ragId,
          username,
          fileKey,
          fileName
        );

        // Update file status to syncing (AutoRAG sync job started)
        await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.SYNCING);

        // Start immediate polling for this job via Durable Object
        await SyncQueueService.startPollingForJob(env, jobId, username);

        console.log(
          `[SyncQueue] Triggered immediate sync for file ${fileName}, job: ${jobId}`
        );

        return {
          queued: false,
          jobId,
          message: `File ${fileName} indexing started immediately`,
        };
      } catch (error) {
        console.error(
          `[SyncQueue] Failed to trigger sync for ${fileName}:`,
          error
        );

        // If sync fails, queue it for retry
        await fileDAO.addToSyncQueue(username, fileKey, fileName, ragId);

        // Update file status to syncing when queued for retry
        await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.SYNCING);

        return {
          queued: true,
          message: `File ${fileName} queued for retry (sync failed)`,
        };
      }
    }
  }

  /**
   * Process the sync queue when a job completes
   */
  static async processSyncQueue(
    env: any,
    username: string,
    jwt?: string
  ): Promise<{ processed: number; jobId?: string }> {
    const fileDAO = new FileDAO(env.DB);

    // Get all pending queue items for this user
    const queueItems = await fileDAO.getSyncQueue(username);

    if (queueItems.length === 0) {
      console.log(`[SyncQueue] No items in queue for user ${username}`);
      return { processed: 0 };
    }

    console.log(
      `[SyncQueue] Processing ${queueItems.length} queued items for user ${username}`
    );

    // Process the first item in the queue
    const firstItem = queueItems[0];
    const ragId = AUTORAG_CONFIG.LIBRARY_RAG_ID;

    try {
      // Trigger sync for the queued file
      const jobId = await AutoRAGService.triggerSync(ragId, 0, jwt, env);

      // Store the job for tracking
      await fileDAO.createAutoRAGJob(
        jobId,
        ragId,
        username,
        firstItem.file_key,
        firstItem.file_name
      );

      // Remove from queue
      await fileDAO.removeFromSyncQueue(firstItem.file_key);

      console.log(
        `[SyncQueue] Processed queued file ${firstItem.file_name}, job: ${jobId}`
      );

      return {
        processed: 1,
        jobId,
      };
    } catch (error) {
      console.error(
        `[SyncQueue] Failed to process queued file ${firstItem.file_name}:`,
        error
      );

      // Remove from queue even if it fails to avoid infinite retries
      await fileDAO.removeFromSyncQueue(firstItem.file_key);

      return { processed: 0 };
    }
  }

  /**
   * Check if a user has any queued items
   */
  static async hasQueuedItems(env: any, username: string): Promise<boolean> {
    const fileDAO = new FileDAO(env.DB);
    const queueItems = await fileDAO.getSyncQueue(username);
    return queueItems.length > 0;
  }

  /**
   * Get queue status for a user
   */
  static async getQueueStatus(
    env: any,
    username: string
  ): Promise<{
    queuedCount: number;
    ongoingJobs: boolean;
    queueItems: any[];
  }> {
    const fileDAO = new FileDAO(env.DB);

    const queueItems = await fileDAO.getSyncQueue(username);
    const hasOngoingJobs = await fileDAO.hasOngoingAutoRAGJobs(username);

    return {
      queuedCount: queueItems.length,
      ongoingJobs: hasOngoingJobs,
      queueItems,
    };
  }

  /**
   * Start immediate polling for a specific AutoRAG job
   * This will poll every 10 seconds until the job completes
   */
  static async startPollingForJob(
    env: any,
    jobId: string,
    username: string
  ): Promise<void> {
    console.log(
      `[SyncQueue] Starting polling for job: ${jobId} via Durable Object`
    );

    try {
      // Get the AutoRAG Polling Durable Object for this user
      const durableObjectId = env.AUTORAG_POLLING.idFromName(username);
      const durableObject = env.AUTORAG_POLLING.get(durableObjectId);

      // Start polling
      const response = await durableObject.fetch(
        "http://localhost/start-polling",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, username }),
        }
      );

      const result = await response.json();

      if (result.success) {
        console.log(
          `[SyncQueue] Polling started successfully for job: ${jobId}`
        );
      } else {
        console.error(
          `[SyncQueue] Failed to start polling for job ${jobId}:`,
          result.error
        );
      }
    } catch (error) {
      console.error(
        `[SyncQueue] Error starting polling for job ${jobId}:`,
        error
      );
    }
  }

  /**
   * Queue a file for AutoRAG sync via Durable Object
   */
  static async queueFileForSync(
    env: any,
    username: string,
    fileKey: string,
    fileName: string,
    ragId: string
  ): Promise<{ queued: boolean; queuePosition?: number }> {
    try {
      // Get the AutoRAG Polling Durable Object for this user
      const durableObjectId = env.AUTORAG_POLLING.idFromName(username);
      const durableObject = env.AUTORAG_POLLING.get(durableObjectId);

      // Queue the file
      const response = await durableObject.fetch(
        "http://localhost/queue-sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileKey, fileName, ragId, username }),
        }
      );

      const result = await response.json();

      if (result.success) {
        // Update file status to syncing when queued or processing immediately
        const fileDAO = new FileDAO(env.DB);
        await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.SYNCING);

        console.log(
          `[SyncQueue] File ${fileName} ${result.queued ? "queued" : "processing immediately"}`
        );
        return { queued: result.queued, queuePosition: result.queuePosition };
      } else {
        console.error(
          `[SyncQueue] Failed to queue file ${fileName}:`,
          result.error
        );
        return { queued: false };
      }
    } catch (error) {
      console.error(`[SyncQueue] Error queueing file ${fileName}:`, error);
      return { queued: false };
    }
  }
}
