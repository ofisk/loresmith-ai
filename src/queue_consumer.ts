import { getDAOFactory } from "./dao/dao-factory";
import { R2Helper } from "./lib/r2";
import { FileSplitter } from "./lib/split";
import type { Env } from "./middleware/auth";

export interface ProcessingMessage {
  bucket: string;
  key: string;
  size: number;
  contentType: string;
  tenant: string;
  originalName: string;
}

export class FileProcessingQueue {
  constructor(private env: Env) {}

  /**
   * Process a file from staging to library storage
   */
  async processFile(message: ProcessingMessage): Promise<void> {
    const startTime = Date.now();
    const { key, contentType, tenant, originalName } = message;

    console.log(`[FileProcessingQueue] Starting processing for ${key}`);

    try {
      const r2Helper = new R2Helper(this.env);
      const fileSplitter = new FileSplitter();

      // Download file from staging
      const fileContent = await r2Helper.get(key);
      if (!fileContent) {
        throw new Error(`File not found in staging: ${key}`);
      }

      console.log(
        `[FileProcessingQueue] Downloaded ${fileContent.byteLength} bytes from staging`
      );

      // Check if file needs splitting (≤ 4MB can be promoted directly)
      const maxShardSize = 4 * 1024 * 1024; // 4MB

      if (fileContent.byteLength <= maxShardSize) {
        // Promote directly to library storage
        const destKey = `library/${tenant}/${originalName}`;

        // Check if destination already exists (idempotent)
        if (!(await r2Helper.exists(destKey))) {
          await r2Helper.put(destKey, fileContent, contentType);
          console.log(
            `[FileProcessingQueue] Promoted file directly: ${key} → ${destKey}`
          );
        } else {
          console.log(
            `[FileProcessingQueue] Destination already exists, skipping: ${destKey}`
          );
        }

        // Update file status in database for directly promoted files
        const fileDAO = getDAOFactory(this.env).fileDAO;
        try {
          await fileDAO.updateFileStatusByKey(destKey, "processed");
          console.log(
            `[FileProcessingQueue] Updated file status to processed: ${destKey}`
          );
        } catch (error) {
          console.error(
            `[FileProcessingQueue] Failed to update file status: ${error}`
          );
        }
      } else {
        // Split file into shards
        const splitResult = await fileSplitter.splitFile(fileContent, {
          maxShardSize,
          contentType,
          originalFilename: originalName,
          tenant,
        });

        console.log(
          `[FileProcessingQueue] Split into ${splitResult.shards.length} shards`
        );

        // Upload shards to library storage
        for (const shard of splitResult.shards) {
          // Check if shard already exists (idempotent)
          if (!(await r2Helper.exists(shard.key))) {
            await r2Helper.put(shard.key, shard.content, shard.contentType);
          } else {
            console.log(
              `[FileProcessingQueue] Shard already exists, skipping: ${shard.key}`
            );
          }
        }

        // Upload manifest
        const manifestKey = `library/${tenant}/manifests/${originalName}.manifest.json`;
        const manifestContent = JSON.stringify(splitResult.manifest, null, 2);
        const manifestBuffer = new TextEncoder().encode(manifestContent);

        if (!(await r2Helper.exists(manifestKey))) {
          await r2Helper.put(
            manifestKey,
            manifestBuffer.buffer.slice(
              manifestBuffer.byteOffset,
              manifestBuffer.byteOffset + manifestBuffer.byteLength
            ),
            "application/json"
          );
          console.log(
            `[FileProcessingQueue] Uploaded manifest: ${manifestKey}`
          );
        } else {
          console.log(
            `[FileProcessingQueue] Manifest already exists, skipping: ${manifestKey}`
          );
        }
      }

      // Update file status in database to mark as processed
      const fileDAO = getDAOFactory(this.env).fileDAO;
      const fileKey = `library/${tenant}/${originalName}`;

      try {
        await fileDAO.updateFileStatusByKey(fileKey, "processed");
        console.log(
          `[FileProcessingQueue] Updated file status to processed: ${fileKey}`
        );
      } catch (error) {
        console.error(
          `[FileProcessingQueue] Failed to update file status: ${error}`
        );
        // Don't fail the entire process if database update fails
      }

      // Clean up staging file
      await r2Helper.delete(key);

      const processingTime = Date.now() - startTime;
      console.log(
        `[FileProcessingQueue] Completed processing ${key} in ${processingTime}ms`
      );
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(
        `[FileProcessingQueue] Error processing ${key} after ${processingTime}ms:`,
        error
      );

      // Send to dead letter queue
      await this.env.FILE_PROCESSING_DLQ.send({
        originalMessage: message,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
        processingTime,
      });

      throw error;
    }
  }

  /**
   * Handle queue messages
   */
  async handleMessage(message: ProcessingMessage): Promise<void> {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        await this.processFile(message);
        return; // Success, exit retry loop
      } catch (error) {
        retryCount++;
        console.error(
          `[FileProcessingQueue] Attempt ${retryCount}/${maxRetries} failed:`,
          error
        );

        if (retryCount >= maxRetries) {
          console.error(
            `[FileProcessingQueue] Max retries exceeded for ${message.key}`
          );
          throw error;
        }

        // Exponential backoff
        const delay = 2 ** retryCount * 1000; // 2s, 4s, 8s
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Clean up old staging files
   */
  async cleanupStaging(): Promise<void> {
    try {
      const r2Helper = new R2Helper(this.env);
      const deletedCount = await r2Helper.cleanupOldStagingObjects(24); // 24 hours
      console.log(
        `[FileProcessingQueue] Cleaned up ${deletedCount} old staging files`
      );
    } catch (error) {
      console.error("[FileProcessingQueue] Error cleaning up staging:", error);
    }
  }

  /**
   * Get processing statistics
   */
  async getStats(): Promise<{
    staging: { objectCount: number; totalSize: number };
    library: { objectCount: number; totalSize: number };
    processingTime: number;
  }> {
    const startTime = Date.now();

    try {
      const r2Helper = new R2Helper(this.env);
      const stats = await r2Helper.getBucketStats();

      return {
        ...stats,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error("[FileProcessingQueue] Error getting stats:", error);
      return {
        staging: { objectCount: 0, totalSize: 0 },
        library: { objectCount: 0, totalSize: 0 },
        processingTime: Date.now() - startTime,
      };
    }
  }
}

// Export the queue handler function for Wrangler
export async function queue(
  batch: MessageBatch<ProcessingMessage>,
  env: Env
): Promise<void> {
  const processor = new FileProcessingQueue(env);

  console.log(`[Queue] Processing ${batch.messages.length} messages`);

  for (const message of batch.messages) {
    try {
      await processor.handleMessage(message.body);
      message.ack();
    } catch (error) {
      console.error(`[Queue] Failed to process message:`, error);
      message.retry();
    }
  }
}

export async function scheduled(
  _event: ScheduledEvent,
  env: Env
): Promise<void> {
  // Clean up old staging files every hour
  const processor = new FileProcessingQueue(env);
  await processor.cleanupStaging();

  // Clean up files stuck in processing status (1 minute timeout)
  await cleanupStuckProcessingFiles(env);
}

/**
 * Clean up files that have been stuck in processing status for too long
 */
async function cleanupStuckProcessingFiles(env: Env): Promise<void> {
  try {
    const { getDAOFactory } = await import("./dao/dao-factory");
    const { FileDAO } = await import("./dao/file-dao");
    const { notifyFileStatusUpdated } = await import("./lib/notifications");

    const fileDAO = getDAOFactory(env).fileDAO;

    // Get files stuck in processing or syncing for more than 1 minute
    const stuckFiles = await fileDAO.getStuckProcessingFiles(1);

    if (stuckFiles.length > 0) {
      console.log(
        `[ScheduledCleanup] Found ${stuckFiles.length} files stuck in processing/syncing status`
      );

      for (const file of stuckFiles) {
        // Mark file as failed due to timeout
        await fileDAO.markFileAsTimeoutFailed(
          file.file_key,
          `Processing timeout - stuck in processing/syncing for more than 1 minute`
        );

        // Send notification to user
        try {
          await notifyFileStatusUpdated(
            env,
            file.username,
            file.file_key,
            file.file_name,
            FileDAO.STATUS.ERROR
          );
        } catch (notifyError) {
          console.error(
            `[ScheduledCleanup] Failed to notify user ${file.username} about timeout:`,
            notifyError
          );
        }

        console.log(
          `[ScheduledCleanup] Marked file ${file.file_name} as failed due to timeout`
        );
      }

      console.log(
        `[ScheduledCleanup] Cleaned up ${stuckFiles.length} stuck files`
      );
    }
  } catch (error) {
    console.error(
      "[ScheduledCleanup] Error cleaning up stuck processing files:",
      error
    );
  }
}
