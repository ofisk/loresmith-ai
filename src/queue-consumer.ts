import { getDAOFactory } from "./dao/dao-factory";
import { FileDAO } from "./dao/file-dao";
import { R2Helper } from "./lib/r2";
import { notifyFileStatusUpdated } from "./lib/notifications";
import { FileSplitter } from "./lib/split";
import type { Env } from "./middleware/auth";
import { ChunkedProcessingService } from "./services/file/chunked-processing-service";
import { SyncQueueService } from "./services/file/sync-queue-service";
import { EntityExtractionQueueService } from "./services/campaign/entity-extraction-queue-service";
import { RebuildQueueProcessor } from "./services/graph/rebuild-queue-processor";
import type { RebuildQueueMessage } from "./types/rebuild-queue";
import { RebuildQueueService } from "./services/graph/rebuild-queue-service";
import { RebuildTriggerService } from "./services/graph/rebuild-trigger-service";
import { WorldStateChangelogDAO } from "./dao/world-state-changelog-dao";

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

// Type guard to check if message is a rebuild queue message
function isRebuildQueueMessage(message: any): message is RebuildQueueMessage {
  return (
    message &&
    typeof message === "object" &&
    "rebuildId" in message &&
    "campaignId" in message &&
    "rebuildType" in message
  );
}

// Export the queue handler function for Wrangler
export async function queue(
  batch: MessageBatch<ProcessingMessage | RebuildQueueMessage>,
  env: Env
): Promise<void> {
  console.log(`[Queue] Processing ${batch.messages.length} messages`);

  const fileProcessor = new FileProcessingQueue(env);
  const rebuildProcessor = new RebuildQueueProcessor(env);

  for (const message of batch.messages) {
    try {
      // Route to appropriate processor based on message type
      if (isRebuildQueueMessage(message.body)) {
        await rebuildProcessor.handleMessage(message.body);
      } else {
        await fileProcessor.handleMessage(message.body as ProcessingMessage);
      }
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

  // Process pending sync queue items for all users
  await processPendingSyncQueueItems(env);

  // Process pending entity extraction queue items
  await EntityExtractionQueueService.processPendingQueueItems(env);

  // Process pending file chunks for files that have been chunked
  await processPendingFileChunks(env);

  // Clean up files stuck in processing status (10 minute timeout)
  await cleanupStuckProcessingFiles(env, 10);

  // Check campaigns and trigger rebuilds if needed
  await checkAndTriggerRebuilds(env);
}

/**
 * Check campaigns with unapplied changelog entries and trigger rebuilds if needed
 */
async function checkAndTriggerRebuilds(env: Env): Promise<void> {
  try {
    const daoFactory = getDAOFactory(env);
    const worldStateChangelogDAO = new WorldStateChangelogDAO(env.DB!);
    const rebuildTriggerService = new RebuildTriggerService(
      daoFactory.campaignDAO
    );

    // Get campaigns with unapplied changelog entries
    const campaignIds =
      await worldStateChangelogDAO.getCampaignIdsWithUnappliedEntries();

    if (campaignIds.length === 0) {
      console.log(
        "[RebuildCron] No campaigns with unapplied changelog entries"
      );
      return;
    }

    console.log(
      `[RebuildCron] Checking ${campaignIds.length} campaign(s) for rebuild needs`
    );

    if (!env.GRAPH_REBUILD_QUEUE) {
      console.warn(
        "[RebuildCron] GRAPH_REBUILD_QUEUE binding not configured, skipping rebuild checks"
      );
      return;
    }

    const queueService = new RebuildQueueService(env.GRAPH_REBUILD_QUEUE);

    for (const campaignId of campaignIds) {
      try {
        // Check if there's already an active rebuild
        const activeRebuilds =
          await daoFactory.rebuildStatusDAO.getActiveRebuilds(campaignId);
        if (activeRebuilds.length > 0) {
          console.log(
            `[RebuildCron] Campaign ${campaignId} already has active rebuild, skipping`
          );
          continue;
        }

        // Get unapplied entries to determine affected entities
        const unappliedEntries =
          await worldStateChangelogDAO.listEntriesForCampaign(campaignId, {
            appliedToGraph: false,
          });

        // Extract affected entity IDs from changelog entries
        const affectedEntityIds = new Set<string>();
        for (const entry of unappliedEntries) {
          for (const update of entry.payload.entity_updates || []) {
            if (update.entity_id) {
              affectedEntityIds.add(update.entity_id);
            }
          }
          for (const update of entry.payload.relationship_updates || []) {
            if (update.from) affectedEntityIds.add(update.from);
            if (update.to) affectedEntityIds.add(update.to);
          }
          for (const entity of entry.payload.new_entities || []) {
            if (entity.entity_id) {
              affectedEntityIds.add(entity.entity_id);
            }
          }
        }

        // Make rebuild decision based on impact
        const decision = await rebuildTriggerService.makeRebuildDecision(
          campaignId,
          Array.from(affectedEntityIds)
        );

        if (decision.shouldRebuild) {
          console.log(
            `[RebuildCron] Triggering ${decision.rebuildType} rebuild for campaign ${campaignId} (impact: ${decision.cumulativeImpact})`
          );

          // decision.rebuildType is guaranteed to be "full" or "partial" when shouldRebuild is true
          const rebuildType =
            decision.rebuildType === "partial" ? "partial" : "full";

          // Create rebuild status entry
          const rebuildId = crypto.randomUUID();
          await daoFactory.rebuildStatusDAO.createRebuild({
            id: rebuildId,
            campaignId,
            rebuildType,
            status: "pending",
            affectedEntityIds:
              rebuildType === "partial"
                ? Array.from(affectedEntityIds)
                : undefined,
          });

          // Enqueue rebuild job
          await queueService.enqueueRebuild({
            rebuildId,
            campaignId,
            rebuildType,
            affectedEntityIds:
              rebuildType === "partial"
                ? Array.from(affectedEntityIds)
                : undefined,
            triggeredBy: "scheduled",
            options: {
              regenerateSummaries: true,
              recalculateImportance: true,
            },
          });

          console.log(
            `[RebuildCron] Rebuild ${rebuildId} enqueued for campaign ${campaignId}`
          );
        } else {
          console.log(
            `[RebuildCron] Campaign ${campaignId} does not need rebuild (impact: ${decision.cumulativeImpact})`
          );
        }
      } catch (error) {
        console.error(
          `[RebuildCron] Error checking campaign ${campaignId}:`,
          error
        );
        // Continue with next campaign
      }
    }
  } catch (error) {
    console.error("[RebuildCron] Error in rebuild check:", error);
  }
}

/**
 * Process pending sync queue items for all users
 * This runs periodically to retry processing queued files
 */
async function processPendingSyncQueueItems(env: Env): Promise<void> {
  try {
    const fileDAO = getDAOFactory(env).fileDAO;

    // Get all usernames with pending queue items
    const usernames = await fileDAO.getUsernamesWithPendingQueueItems();

    if (usernames.length === 0) {
      console.log("[SyncQueue] No pending queue items to process");
      return;
    }

    console.log(
      `[SyncQueue] Processing queue for ${usernames.length} user(s) with pending items`
    );

    let totalProcessed = 0;
    for (const username of usernames) {
      try {
        const result = await SyncQueueService.processSyncQueue(env, username);
        totalProcessed += result.processed;
        if (result.processed > 0) {
          console.log(
            `[SyncQueue] Processed ${result.processed} item(s) for user ${username}`
          );
        }
      } catch (error) {
        console.error(
          `[SyncQueue] Failed to process queue for user ${username}:`,
          error
        );
        // Continue processing other users even if one fails
      }
    }

    if (totalProcessed > 0) {
      console.log(
        `[SyncQueue] Completed processing: ${totalProcessed} total item(s) processed`
      );
    }
  } catch (error) {
    console.error(
      "[SyncQueue] Error processing pending sync queue items:",
      error
    );
  }
}

/**
 * Process pending file chunks for files that have been split into chunks
 */
async function processPendingFileChunks(env: Env): Promise<void> {
  try {
    const fileDAO = getDAOFactory(env).fileDAO;
    const chunkedService = new ChunkedProcessingService(env);

    // Get all files with pending chunks
    const pendingChunks = await fileDAO.getPendingFileChunks();

    if (pendingChunks.length === 0) {
      console.log("[ChunkProcessor] No pending file chunks to process");
      return;
    }

    console.log(
      `[ChunkProcessor] Processing ${pendingChunks.length} pending chunk(s)`
    );

    // Group chunks by file_key
    const chunksByFile = new Map<string, typeof pendingChunks>();
    for (const chunk of pendingChunks) {
      if (!chunksByFile.has(chunk.fileKey)) {
        chunksByFile.set(chunk.fileKey, []);
      }
      chunksByFile.get(chunk.fileKey)!.push(chunk);
    }

    // Process chunks for each file
    for (const [fileKey, chunks] of chunksByFile) {
      try {
        // Get file from R2
        const file = await env.R2.get(fileKey);
        if (!file) {
          console.error(`[ChunkProcessor] File not found: ${fileKey}`);
          // Mark all chunks as failed
          for (const chunk of chunks) {
            await fileDAO.updateFileProcessingChunk(chunk.id, {
              status: "failed",
              errorMessage: "File not found in R2",
            });
          }
          continue;
        }

        // Get file metadata
        const dbMetadata = await fileDAO.getFileForRag(
          fileKey,
          chunks[0].username
        );
        if (!dbMetadata) {
          console.error(`[ChunkProcessor] File metadata not found: ${fileKey}`);
          continue;
        }

        const contentType =
          dbMetadata.content_type || file.httpMetadata?.contentType || "";
        const metadataId = dbMetadata.file_key;

        // Determine if we should load the full buffer based on file size
        // If file is chunked, it's too large to load in memory - skip trying
        const fileSizeMB = (dbMetadata.file_size || 0) / (1024 * 1024);
        const MEMORY_LIMIT_MB = 128;
        const SAFE_THRESHOLD_MB = 100; // For PDFs, be conservative

        // Check if file size indicates we should skip loading full buffer
        const shouldSkipFullBuffer =
          fileSizeMB > MEMORY_LIMIT_MB ||
          (contentType.includes("pdf") && fileSizeMB > SAFE_THRESHOLD_MB);

        let fileBuffer: ArrayBuffer | null = null;
        let usePerChunkFetch = shouldSkipFullBuffer;

        if (!shouldSkipFullBuffer) {
          // Only try to load full buffer if file size is safe
          try {
            fileBuffer = await file.arrayBuffer();
          } catch (bufferError) {
            console.warn(
              `[ChunkProcessor] Failed to load full file buffer for ${fileKey}, will fetch per chunk:`,
              bufferError instanceof Error
                ? bufferError.message
                : String(bufferError)
            );
            usePerChunkFetch = true;
          }
        } else {
          console.log(
            `[ChunkProcessor] Skipping full buffer load for ${fileKey} (${fileSizeMB.toFixed(2)}MB) - file is too large, will fetch per chunk`
          );
        }

        // Process each chunk
        for (const chunk of chunks) {
          try {
            // If we couldn't load the full buffer, fetch the file fresh for this chunk
            let chunkBuffer: ArrayBuffer;
            if (usePerChunkFetch) {
              const chunkFile = await env.R2.get(fileKey);
              if (!chunkFile) {
                throw new Error("File not found in R2");
              }
              try {
                chunkBuffer = await chunkFile.arrayBuffer();
              } catch (chunkBufferError) {
                // Even per-chunk fetch failed - file is too large for Worker memory
                throw new Error(
                  `File too large to process: ${chunkBufferError instanceof Error ? chunkBufferError.message : "Memory limit exceeded"}`
                );
              }
            } else {
              chunkBuffer = fileBuffer!;
            }

            const chunkDefinition = {
              chunkIndex: chunk.chunkIndex,
              totalChunks: chunk.totalChunks,
              pageRangeStart: chunk.pageRangeStart,
              pageRangeEnd: chunk.pageRangeEnd,
              byteRangeStart: chunk.byteRangeStart,
              byteRangeEnd: chunk.byteRangeEnd,
            };

            await chunkedService.processChunk(
              chunk.id,
              fileKey,
              chunkDefinition,
              chunkBuffer,
              contentType,
              metadataId
            );

            console.log(
              `[ChunkProcessor] Successfully processed chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} for file ${fileKey}`
            );
          } catch (chunkError) {
            const errorMessage =
              chunkError instanceof Error
                ? chunkError.message
                : String(chunkError);
            console.error(
              `[ChunkProcessor] Failed to process chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} for file ${fileKey}:`,
              errorMessage
            );

            // Update retry count
            const currentRetryCount = chunk.retryCount;
            const MAX_RETRIES = 3;

            if (currentRetryCount < MAX_RETRIES) {
              await fileDAO.updateFileProcessingChunk(chunk.id, {
                retryCount: currentRetryCount + 1,
                status: "pending", // Keep as pending for retry
              });
            } else {
              await fileDAO.updateFileProcessingChunk(chunk.id, {
                status: "failed",
                errorMessage: errorMessage,
              });
            }
          }
        }

        // Check if all chunks for this file are complete
        const mergeResult = await chunkedService.mergeChunkResults(fileKey);
        if (mergeResult.allComplete && mergeResult.allSuccessful) {
          // Mark file as completed
          await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.COMPLETED);
          console.log(
            `[ChunkProcessor] All chunks complete for file ${fileKey}`
          );
        } else if (mergeResult.allComplete && !mergeResult.allSuccessful) {
          // Some chunks failed - mark file as error
          await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.ERROR);
          console.error(
            `[ChunkProcessor] Some chunks failed for file ${fileKey}. Stats:`,
            mergeResult.stats
          );
        }
      } catch (fileError) {
        console.error(
          `[ChunkProcessor] Error processing chunks for file ${fileKey}:`,
          fileError
        );
      }
    }
  } catch (error) {
    console.error(
      "[ChunkProcessor] Error processing pending file chunks:",
      error
    );
  }
}

/**
 * Clean up files that have been stuck in processing status for too long
 * Can be called manually or via scheduled event
 */
export async function cleanupStuckProcessingFiles(
  env: Env,
  timeoutMinutes: number = 10,
  fileKey?: string
): Promise<{
  cleaned: number;
  files: Array<{ fileKey: string; fileName: string; username: string }>;
}> {
  try {
    const fileDAO = getDAOFactory(env).fileDAO;

    // Get files stuck in processing or syncing for the specified timeout
    const allStuckFiles = await fileDAO.getStuckProcessingFiles(timeoutMinutes);

    // Filter to specific file if requested
    const stuckFiles = fileKey
      ? allStuckFiles.filter((f) => f.file_key === fileKey)
      : allStuckFiles;

    if (stuckFiles.length > 0) {
      console.log(
        `[ScheduledCleanup] Found ${stuckFiles.length} files stuck in processing/syncing status`
      );

      for (const file of stuckFiles) {
        // Mark file as failed due to timeout
        await fileDAO.markFileAsTimeoutFailed(
          file.file_key,
          `Processing timeout - stuck in processing/syncing/indexing/uploaded for more than ${timeoutMinutes} minute${timeoutMinutes !== 1 ? "s" : ""}`
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

      return {
        cleaned: stuckFiles.length,
        files: stuckFiles.map((f) => ({
          fileKey: f.file_key,
          fileName: f.file_name,
          username: f.username,
        })),
      };
    }

    return { cleaned: 0, files: [] };
  } catch (error) {
    console.error(
      "[ScheduledCleanup] Error cleaning up stuck processing files:",
      error
    );
    return { cleaned: 0, files: [] };
  }
}
