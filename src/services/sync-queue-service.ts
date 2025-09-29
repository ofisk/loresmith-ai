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
    const startTime = Date.now();
    console.log(`[DEBUG] [SyncQueue] ===== PROCESSING FILE UPLOAD =====`);
    console.log(`[DEBUG] [SyncQueue] File: ${fileName}`);
    console.log(`[DEBUG] [SyncQueue] File Key: ${fileKey}`);
    console.log(`[DEBUG] [SyncQueue] User: ${username}`);
    console.log(`[DEBUG] [SyncQueue] JWT Present: ${jwt ? "YES" : "NO"}`);
    console.log(`[DEBUG] [SyncQueue] Timestamp: ${new Date().toISOString()}`);

    const fileDAO = new FileDAO(env.DB);
    const ragId = AUTORAG_CONFIG.LIBRARY_RAG_ID;
    console.log(`[DEBUG] [SyncQueue] Using ragId: ${ragId}`);

    // Check if there are any ongoing AutoRAG jobs globally (single AutoRAG instance)
    console.log(`[DEBUG] [SyncQueue] Checking for any ongoing jobs (global)`);
    const globalPending = await fileDAO.getAllPendingAutoRAGJobs();
    const hasOngoingJobs = (globalPending?.length || 0) > 0;
    console.log(
      `[DEBUG] [SyncQueue] Has ongoing jobs (global): ${hasOngoingJobs} (count=${globalPending?.length || 0})`
    );

    // Get detailed job information for debugging
    try {
      const ongoingJobs = await fileDAO.getPendingAutoRAGJobs(username);
      console.log(`[DEBUG] [SyncQueue] Ongoing jobs details:`, ongoingJobs);
    } catch (error) {
      console.error(
        `[DEBUG] [SyncQueue] Error getting ongoing jobs details:`,
        error
      );
    }

    if (hasOngoingJobs) {
      console.log(
        `[DEBUG] [SyncQueue] Ongoing job detected globally, queuing file...`
      );
      // Queue via Durable Object if a job is already in progress
      const queueResult = await SyncQueueService.queueFileForSync(
        env,
        username,
        fileKey,
        fileName,
        ragId
      );

      console.log(`[DEBUG] [SyncQueue] Queue result:`, queueResult);
      console.log(
        `[DEBUG] [SyncQueue] File ${fileName} ${queueResult.queued ? "queued" : "processing immediately"} for user ${username}`
      );

      // If DO reported not queued (no active polling), immediately trigger a sync here
      if (!queueResult.queued) {
        try {
          console.log(
            `[DEBUG] [SyncQueue] No active polling detected. Triggering immediate sync fallback...`
          );
          const jobId = await AutoRAGService.triggerSync(ragId, 0, jwt, env);
          console.log(
            `[DEBUG] [SyncQueue] Fallback immediate sync triggered successfully, jobId: ${jobId}`
          );

          await fileDAO.createAutoRAGJob(
            jobId,
            ragId,
            username,
            fileKey,
            fileName
          );

          console.log(`[DEBUG] [SyncQueue] Updating file status to SYNCING...`);
          await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.SYNCING);
          console.log(`[DEBUG] [SyncQueue] File status updated to SYNCING`);

          console.log(`[DEBUG] [SyncQueue] Starting polling for job...`);
          await SyncQueueService.startPollingForJob(env, jobId, username);
          console.log(`[DEBUG] [SyncQueue] Polling started for job: ${jobId}`);

          const endTime = Date.now();
          const duration = endTime - startTime;
          console.log(
            `[DEBUG] [SyncQueue] ===== FILE UPLOAD PROCESSING COMPLETED (IMMEDIATE VIA FALLBACK) =====`
          );
          console.log(`[DEBUG] [SyncQueue] Duration: ${duration}ms`);
          console.log(`[DEBUG] [SyncQueue] Status: IMMEDIATE SYNC STARTED`);

          return {
            queued: false,
            jobId,
            message: `File ${fileName} indexing started immediately`,
          };
        } catch (error) {
          console.error(
            `[DEBUG] [SyncQueue] Fallback immediate sync failed, leaving in queue:`,
            error
          );
          // Continue as queued below
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;
      console.log(
        `[DEBUG] [SyncQueue] ===== FILE UPLOAD PROCESSING COMPLETED (QUEUED) =====`
      );
      console.log(`[DEBUG] [SyncQueue] Duration: ${duration}ms`);
      console.log(`[DEBUG] [SyncQueue] Status: QUEUED`);

      return {
        queued: true,
        message: `File ${fileName} queued for indexing (sync in progress)`,
      };
    } else {
      console.log(
        `[DEBUG] [SyncQueue] No ongoing jobs, triggering immediate sync...`
      );
      // No ongoing jobs, trigger sync immediately
      try {
        console.log(
          `[DEBUG] [SyncQueue] Calling AutoRAGService.triggerSync...`
        );
        console.log(`[DEBUG] [SyncQueue] triggerSync params:`, {
          ragId,
          offset: 0,
          jwtPresent: jwt ? "YES" : "NO",
          envPresent: env ? "YES" : "NO",
        });

        const jobId = await AutoRAGService.triggerSync(ragId, 0, jwt, env);
        console.log(
          `[DEBUG] [SyncQueue] AutoRAG sync triggered successfully, jobId: ${jobId}`
        );
        console.log(`[DEBUG] [SyncQueue] AutoRAG sync result:`, {
          jobId,
          ragId,
          username,
          fileKey,
          fileName,
          timestamp: new Date().toISOString(),
        });

        // Store the job for tracking
        console.log(`[DEBUG] [SyncQueue] Creating AutoRAG job record...`);
        await fileDAO.createAutoRAGJob(
          jobId,
          ragId,
          username,
          fileKey,
          fileName
        );
        console.log(`[DEBUG] [SyncQueue] AutoRAG job record created`);

        // Update file status to syncing (AutoRAG sync job started)
        console.log(`[DEBUG] [SyncQueue] Updating file status to SYNCING...`);
        await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.SYNCING);
        console.log(`[DEBUG] [SyncQueue] File status updated to SYNCING`);

        // Start immediate polling for this job via Durable Object
        console.log(`[DEBUG] [SyncQueue] Starting polling for job...`);
        await SyncQueueService.startPollingForJob(env, jobId, username);
        console.log(`[DEBUG] [SyncQueue] Polling started for job: ${jobId}`);

        const endTime = Date.now();
        const duration = endTime - startTime;
        console.log(
          `[DEBUG] [SyncQueue] ===== FILE UPLOAD PROCESSING COMPLETED (IMMEDIATE) =====`
        );
        console.log(`[DEBUG] [SyncQueue] Duration: ${duration}ms`);
        console.log(`[DEBUG] [SyncQueue] Status: IMMEDIATE SYNC STARTED`);
        console.log(`[DEBUG] [SyncQueue] Job ID: ${jobId}`);

        return {
          queued: false,
          jobId,
          message: `File ${fileName} indexing started immediately`,
        };
      } catch (error) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        console.error(
          `[DEBUG] [SyncQueue] ===== FILE UPLOAD PROCESSING FAILED =====`
        );
        console.error(`[DEBUG] [SyncQueue] Duration: ${duration}ms`);
        console.error(
          `[DEBUG] [SyncQueue] Failed to trigger sync for ${fileName}:`,
          error
        );
        console.error(`[DEBUG] [SyncQueue] Error details:`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          fileName,
          fileKey,
          username,
          ragId,
          timestamp: new Date().toISOString(),
        });

        // If sync fails, queue it for retry
        console.log(`[DEBUG] [SyncQueue] Queuing file for retry...`);
        await fileDAO.addToSyncQueue(username, fileKey, fileName, ragId);

        // Update file status to syncing when queued for retry
        console.log(
          `[DEBUG] [SyncQueue] Updating file status to SYNCING for retry...`
        );
        await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.SYNCING);

        console.log(`[DEBUG] [SyncQueue] Status: QUEUED FOR RETRY`);
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
