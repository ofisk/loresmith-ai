// Entity Extraction Queue Service
// Handles queuing and processing entity extraction jobs with rate limit handling and exponential backoff

import { getDAOFactory } from "@/dao/dao-factory";
import { EntityExtractionQueueDAO } from "@/dao/entity-extraction-queue-dao";
import { stageEntitiesFromResource } from "./entity-staging-service";
import { getCampaignRagBasePath } from "@/lib/campaign-operations";
import type { Env } from "@/middleware/auth";

export interface EntityExtractionJobOptions {
  env: Env;
  username: string;
  campaignId: string;
  resourceId: string;
  resourceName: string;
  fileKey?: string;
  openaiApiKey: string;
}

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 2000; // 2 seconds
const MAX_BACKOFF_MS = 300000; // 5 minutes
const RATE_LIMIT_BACKOFF_MULTIPLIER = 2;

/**
 * Calculate exponential backoff delay for rate limits
 */
function calculateBackoffDelay(retryCount: number): number {
  const delay = Math.min(
    INITIAL_BACKOFF_MS * RATE_LIMIT_BACKOFF_MULTIPLIER ** retryCount,
    MAX_BACKOFF_MS
  );
  return delay;
}

/**
 * Extract retry delay from OpenAI rate limit error message
 * OpenAI errors include "Please try again in X.XXXs"
 */
function extractRetryDelayFromError(errorMessage: string): number | null {
  const match = errorMessage.match(/try again in ([\d.]+)s/i);
  if (match) {
    const seconds = parseFloat(match[1]);
    // Add 10% buffer and convert to milliseconds
    return Math.ceil(seconds * 1.1 * 1000);
  }
  return null;
}

/**
 * Check if an error is a rate limit error
 */
function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("too many requests") ||
    message.includes("tokens per min")
  );
}

export class EntityExtractionQueueService {
  /**
   * Add an entity extraction job to the queue
   */
  static async queueEntityExtraction(
    options: EntityExtractionJobOptions
  ): Promise<void> {
    const { env, username, campaignId, resourceId, resourceName, fileKey } =
      options;

    const queueDAO = new EntityExtractionQueueDAO(env.DB);
    await queueDAO.addToQueue(
      username,
      campaignId,
      resourceId,
      resourceName,
      fileKey
    );

    console.log(
      `[EntityExtractionQueue] Queued entity extraction for resource ${resourceId} in campaign ${campaignId}`
    );

    // Trigger processing in the background (non-blocking)
    EntityExtractionQueueService.processQueue(env, username).catch((error) => {
      console.error(
        `[EntityExtractionQueue] Failed to trigger queue processing:`,
        error
      );
    });
  }

  /**
   * Process pending entity extraction jobs
   */
  static async processQueue(
    env: Env,
    username?: string
  ): Promise<{ processed: number; failed: number }> {
    const queueDAO = new EntityExtractionQueueDAO(env.DB);
    const daoFactory = getDAOFactory(env);

    // Get pending queue items
    const queueItems = username
      ? await queueDAO.getPendingQueueItemsForUser(username, 10)
      : await queueDAO.getPendingQueueItems(10);

    if (queueItems.length === 0) {
      return { processed: 0, failed: 0 };
    }

    console.log(
      `[EntityExtractionQueue] Processing ${queueItems.length} queued entity extraction job(s)`
    );

    let processed = 0;
    let failed = 0;

    for (const item of queueItems) {
      try {
        // Mark as processing
        await queueDAO.markAsProcessing(item.id);

        // Get campaign details
        const campaign =
          await daoFactory.campaignDAO.getCampaignByIdWithMapping(
            item.campaign_id,
            item.username
          );

        if (!campaign) {
          throw new Error(
            `Campaign not found: ${item.campaign_id} for user ${item.username}`
          );
        }

        // Get resource details
        const resource = await daoFactory.campaignDAO.getCampaignResourceById(
          item.resource_id,
          item.campaign_id
        );

        if (!resource) {
          throw new Error(
            `Resource not found: ${item.resource_id} in campaign ${item.campaign_id}`
          );
        }

        // Get OpenAI API key from user
        const openaiApiKey = await daoFactory.userDAO.getOpenAIKey(
          item.username
        );

        if (!openaiApiKey) {
          throw new Error(`OpenAI API key not found for user ${item.username}`);
        }

        // Get campaign RAG base path
        const campaignRagBasePath = await getCampaignRagBasePath(
          item.username,
          item.campaign_id,
          env
        );

        if (!campaignRagBasePath) {
          throw new Error(
            `Campaign RAG not initialized for campaign: ${item.campaign_id}`
          );
        }

        // Process entity extraction
        const result = await stageEntitiesFromResource({
          env,
          username: item.username,
          campaignId: item.campaign_id,
          campaignName: campaign.name,
          resource,
          campaignRagBasePath,
          openaiApiKey,
        });

        // Mark as completed
        await queueDAO.markAsCompleted(item.id);

        // Note: Notification is already sent by stageEntitiesFromResource
        // No need to send duplicate notification here

        processed++;
        console.log(
          `[EntityExtractionQueue] Successfully processed entity extraction for resource ${item.resource_id} (${result.entityCount} entities)`
        );
      } catch (error) {
        failed++;
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        console.error(
          `[EntityExtractionQueue] Failed to process entity extraction for resource ${item.resource_id}:`,
          errorMessage
        );

        // Check if it's a rate limit error
        if (isRateLimitError(error)) {
          const currentRetryCount = item.retry_count + 1;

          if (currentRetryCount >= MAX_RETRIES) {
            // Max retries exceeded, mark as failed
            await queueDAO.markAsFailed(
              item.id,
              `Rate limit exceeded after ${MAX_RETRIES} retries: ${errorMessage}`,
              "RATE_LIMIT_EXCEEDED"
            );
            console.error(
              `[EntityExtractionQueue] Max retries exceeded for resource ${item.resource_id}`
            );
          } else {
            // Calculate backoff delay
            const retryDelayFromError =
              extractRetryDelayFromError(errorMessage);
            const backoffDelay = retryDelayFromError
              ? retryDelayFromError
              : calculateBackoffDelay(currentRetryCount);

            const nextRetryAt = new Date(Date.now() + backoffDelay);

            // Mark as rate limited and schedule retry
            await queueDAO.markAsRateLimited(
              item.id,
              currentRetryCount,
              nextRetryAt,
              errorMessage
            );

            console.log(
              `[EntityExtractionQueue] Rate limit detected for resource ${item.resource_id}, will retry in ${Math.round(backoffDelay / 1000)}s (attempt ${currentRetryCount}/${MAX_RETRIES})`
            );
          }
        } else {
          // Non-rate-limit error - check retry count
          const currentRetryCount = item.retry_count + 1;

          if (currentRetryCount >= MAX_RETRIES) {
            // Max retries exceeded, mark as failed
            await queueDAO.markAsFailed(
              item.id,
              errorMessage,
              "EXTRACTION_FAILED"
            );
          } else {
            // Update retry count and reset to pending for retry
            await queueDAO.updateRetryCount(item.id, currentRetryCount);
            // Reset status to pending for retry (with exponential backoff)
            const backoffDelay = calculateBackoffDelay(currentRetryCount);
            const nextRetryAt = new Date(Date.now() + backoffDelay);
            await queueDAO.markAsRateLimited(
              item.id,
              currentRetryCount,
              nextRetryAt,
              errorMessage
            );
          }
        }
      }
    }

    return { processed, failed };
  }

  /**
   * Process pending queue items for all users (called by scheduled function)
   */
  static async processPendingQueueItems(env: Env): Promise<void> {
    try {
      const queueDAO = new EntityExtractionQueueDAO(env.DB);

      // Get all usernames with pending items
      const usernames = await queueDAO.getUsernamesWithPendingItems();

      if (usernames.length === 0) {
        console.log(
          "[EntityExtractionQueue] No pending queue items to process"
        );
        return;
      }

      console.log(
        `[EntityExtractionQueue] Processing queue for ${usernames.length} user(s) with pending items`
      );

      let totalProcessed = 0;
      let totalFailed = 0;

      for (const username of usernames) {
        try {
          const result = await EntityExtractionQueueService.processQueue(
            env,
            username
          );
          totalProcessed += result.processed;
          totalFailed += result.failed;
        } catch (error) {
          console.error(
            `[EntityExtractionQueue] Failed to process queue for user ${username}:`,
            error
          );
        }
      }

      if (totalProcessed > 0 || totalFailed > 0) {
        console.log(
          `[EntityExtractionQueue] Completed processing: ${totalProcessed} processed, ${totalFailed} failed`
        );
      }
    } catch (error) {
      console.error(
        "[EntityExtractionQueue] Error processing pending queue items:",
        error
      );
    }
  }
}
