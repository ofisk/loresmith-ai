// Entity Extraction Queue Service
// Handles queuing and processing entity extraction jobs with rate limit handling and exponential backoff

import { MODEL_CONFIG } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import {
	EntityExtractionQueueDAO,
	type EntityExtractionQueueItem,
} from "@/dao/entity-extraction-queue-dao";
import { TelemetryDAO } from "@/dao/telemetry-dao";
import { getEnvVar } from "@/lib/env-utils";
import type { Env } from "@/middleware/auth";
import { TelemetryService } from "@/services/telemetry/telemetry-service";
import { stageEntitiesFromResource } from "./entity-staging-service";

export interface EntityExtractionJobOptions {
	env: Env;
	username: string;
	campaignId: string;
	resourceId: string;
	resourceName: string;
	fileKey?: string;
	/** When from an approved proposal, the username who proposed the file (for shard attribution) */
	proposedBy?: string | null;
}

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 2000; // 2 seconds
const MAX_BACKOFF_MS = 300000; // 5 minutes
const RATE_LIMIT_BACKOFF_MULTIPLIER = 2;
const MAX_CHUNKS_PER_EXTRACTION_RUN = 3;

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

/**
 * Check if an error is an authentication/key configuration error.
 * These should fail fast (no retries).
 */
function isAuthenticationError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const message = error.message.toLowerCase();
	return (
		message.includes("invalid x-api-key") ||
		message.includes("authentication_error") ||
		message.includes("invalid api key") ||
		message.includes("unauthorized") ||
		(message.includes("401") && message.includes("api"))
	);
}

function parseProgressMarker(
	value: string | null | undefined
): { processedChunks: number; totalChunks: number } | null {
	if (!value) return null;
	const match = value.match(/^PROGRESS:(\d+)\/(\d+)$/);
	if (!match) return null;
	const processedChunks = Number.parseInt(match[1], 10);
	const totalChunks = Number.parseInt(match[2], 10);
	if (!Number.isFinite(processedChunks) || !Number.isFinite(totalChunks)) {
		return null;
	}
	if (processedChunks < 0 || totalChunks <= 0) return null;
	return { processedChunks, totalChunks };
}

export class EntityExtractionQueueService {
	/**
	 * Add an entity extraction job to the queue
	 */
	static async queueEntityExtraction(
		options: EntityExtractionJobOptions
	): Promise<void> {
		const {
			env,
			username,
			campaignId,
			resourceId,
			resourceName,
			fileKey,
			proposedBy,
		} = options;

		const queueDAO = new EntityExtractionQueueDAO(env.DB);
		await queueDAO.addToQueue(
			username,
			campaignId,
			resourceId,
			resourceName,
			fileKey,
			proposedBy
		);

		// Trigger processing in the background (non-blocking)
		EntityExtractionQueueService.processQueue(env, username).catch(
			(_error) => {}
		);
	}

	/**
	 * Process pending entity extraction jobs
	 */
	static async processQueue(
		env: Env,
		username?: string,
		maxItems: number = 10
	): Promise<{ processed: number; failed: number }> {
		const queueDAO = new EntityExtractionQueueDAO(env.DB);
		const daoFactory = getDAOFactory(env);

		// First, check for and reset any stuck processing items for this user
		// (This handles cases where a job got stuck before the scheduled cleanup ran)
		if (username) {
			const stuckItems = await queueDAO.getStuckProcessingItems(10);
			const userStuckItems = stuckItems.filter(
				(item) => item.username === username
			);
			if (userStuckItems.length > 0) {
				for (const item of userStuckItems) {
					await queueDAO.resetStuckProcessingItem(
						item.id,
						"Processing timeout detected during queue processing. Resetting to pending."
					);
				}
			}
		}

		// Get pending queue items
		const queueItems = username
			? await queueDAO.getPendingQueueItemsForUser(username, maxItems)
			: await queueDAO.getPendingQueueItems(maxItems);

		if (queueItems.length === 0) {
			return { processed: 0, failed: 0 };
		}

		let processed = 0;
		let failed = 0;

		for (const item of queueItems) {
			try {
				// Mark as processing
				await queueDAO.markAsProcessing(item.id);
				const runStartedAt = Date.now();

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

				const providerKeyEnvVar =
					MODEL_CONFIG.PROVIDER.DEFAULT === "anthropic"
						? "ANTHROPIC_API_KEY"
						: "OPENAI_API_KEY";
				const llmApiKeyRaw = await getEnvVar(env, providerKeyEnvVar, false);
				const llmApiKey = llmApiKeyRaw.trim();
				if (!llmApiKey) {
					throw new Error(
						`${MODEL_CONFIG.PROVIDER.DEFAULT} API key not configured`
					);
				}
				const openaiApiKeyRaw = await getEnvVar(env, "OPENAI_API_KEY", false);
				const openaiApiKey = openaiApiKeyRaw.trim() || undefined;

				// Get campaign RAG base path (by ID - user already has access via getCampaignByIdWithMapping)
				const campaignRagBasePath =
					await daoFactory.campaignDAO.getCampaignRagBasePathById(
						item.campaign_id
					);

				if (!campaignRagBasePath) {
					throw new Error(
						`Campaign RAG not initialized for campaign: ${item.campaign_id}`
					);
				}

				const progress = parseProgressMarker(item.last_error);
				const resumeFromChunk = progress?.processedChunks ?? 0;

				// Process entity extraction window (checkpointed so cron CPU limits can resume)
				const result = await stageEntitiesFromResource({
					env,
					username: item.username,
					campaignId: item.campaign_id,
					campaignName: campaign.name,
					resource,
					campaignRagBasePath,
					llmApiKey,
					openaiApiKey,
					resumeFromChunk,
					maxChunksPerRun: MAX_CHUNKS_PER_EXTRACTION_RUN,
					onChunkCheckpoint: async ({ processedChunks, totalChunks }) => {
						await queueDAO.updateProcessingProgress(
							item.id,
							processedChunks,
							totalChunks
						);
					},
					attribution:
						item.proposed_by != null
							? { proposedBy: item.proposed_by, approvedBy: item.username }
							: undefined,
				});

				if (!result.success) {
					throw new Error(
						result.error ||
							`Entity extraction failed for resource ${item.resource_id}`
					);
				}

				if (result.completed === false) {
					const nextChunk = result.nextChunkIndex ?? resumeFromChunk;
					const totalChunks = result.totalChunks ?? progress?.totalChunks ?? 0;
					await queueDAO.markAsPending(
						item.id,
						totalChunks > 0
							? `PROGRESS:${nextChunk}/${totalChunks}`
							: item.last_error
					);
					processed++;
					continue;
				}

				// Mark as completed
				await queueDAO.markAsCompleted(item.id);

				void new TelemetryService(new TelemetryDAO(env.DB))
					.recordFileProcessingDuration(Date.now() - runStartedAt, {
						campaignId: item.campaign_id,
						metadata: {
							pipeline: "campaign_resource",
							username: item.username,
							resourceId: item.resource_id,
						},
					})
					.catch(() => {});

				// Note: Notification is already sent by stageEntitiesFromResource
				// No need to send duplicate notification here

				processed++;
			} catch (error) {
				failed++;
				const errorMessage =
					error instanceof Error ? error.message : String(error);

				// Authentication errors should fail fast (do not retry).
				if (isAuthenticationError(error)) {
					await queueDAO.markAsFailed(
						item.id,
						`Authentication/configuration error: ${errorMessage}`,
						"AUTHENTICATION_ERROR"
					);
				} else if (isRateLimitError(error)) {
					const currentRetryCount = item.retry_count + 1;

					if (currentRetryCount >= MAX_RETRIES) {
						// Max retries exceeded, mark as failed
						await queueDAO.markAsFailed(
							item.id,
							`Rate limit exceeded after ${MAX_RETRIES} retries: ${errorMessage}`,
							"RATE_LIMIT_EXCEEDED"
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
			const MAX_JOBS_PER_SCHEDULED_RUN = 2;

			// First, clean up stuck processing items
			await EntityExtractionQueueService.cleanupStuckProcessingItems(env);

			// Get all usernames with pending items
			const usernames = await queueDAO.getUsernamesWithPendingItems();

			if (usernames.length === 0) {
				return;
			}

			let totalProcessed = 0;
			let totalFailed = 0;

			for (const username of usernames) {
				const remainingBudget =
					MAX_JOBS_PER_SCHEDULED_RUN - (totalProcessed + totalFailed);
				if (remainingBudget <= 0) {
					break;
				}

				try {
					const result = await EntityExtractionQueueService.processQueue(
						env,
						username,
						remainingBudget
					);
					totalProcessed += result.processed;
					totalFailed += result.failed;
				} catch (_error) {}
			}

			if (totalProcessed > 0 || totalFailed > 0) {
			}
		} catch (_error) {}
	}

	/**
	 * Clean up queue items that have been stuck in processing status for too long
	 * Resets them back to pending so they can be retried
	 */
	static async cleanupStuckProcessingItems(
		env: Env,
		timeoutMinutes: number = 10
	): Promise<{ reset: number; items: EntityExtractionQueueItem[] }> {
		try {
			const queueDAO = new EntityExtractionQueueDAO(env.DB);

			// Get stuck processing items
			const stuckItems = await queueDAO.getStuckProcessingItems(timeoutMinutes);

			if (stuckItems.length === 0) {
				return { reset: 0, items: [] };
			}

			// Reset each stuck item back to pending
			for (const item of stuckItems) {
				const errorMessage = `Processing timeout - job stuck in processing status for more than ${timeoutMinutes} minute${timeoutMinutes !== 1 ? "s" : ""}. Resetting to pending for retry.`;
				await queueDAO.resetStuckProcessingItem(item.id, errorMessage);
			}

			return { reset: stuckItems.length, items: stuckItems };
		} catch (_error) {
			return { reset: 0, items: [] };
		}
	}
}
