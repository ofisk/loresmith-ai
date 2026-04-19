import type { ExecutionContext, Message } from "@cloudflare/workers-types";
import { MODEL_CONFIG, PROCESSING_LIMITS } from "@/app-constants";
import { FileDAO } from "@/dao";
import { TelemetryDAO } from "@/dao/telemetry-dao";
import { getEnvVar } from "@/lib/env-utils";
import { IMPACT_PER_NEW_ENTITY } from "@/lib/rebuild-config";
import { TelemetryService } from "@/services/telemetry/telemetry-service";
import type { Community } from "./dao/community-dao";
import { getDAOFactory } from "./dao/dao-factory";
import { WorldStateChangelogDAO } from "./dao/world-state-changelog-dao";
import { campaignHasActiveDocumentProcessing } from "./lib/campaign-document-processing";
import { FileSplitter } from "./lib/file/split";
import { createLogger } from "./lib/logger";
import { notifyFileStatusUpdated } from "./lib/notifications";
import { R2Helper } from "./lib/r2";
import type { Env } from "./middleware/auth";
import { ChecklistStatusService } from "./services/campaign/checklist-status-service";
import { EntityExtractionQueueService } from "./services/campaign/entity-extraction-queue-service";
import { LibraryEntityDiscoveryQueueService } from "./services/campaign/library-entity-discovery-queue-service";
import { ChunkedProcessingService } from "./services/file/chunked-processing-service";
import { SyncQueueService } from "./services/file/sync-queue-service";
import { CommunitySummaryService } from "./services/graph/community-summary-service";
import {
	GRAPH_REBUILD_QUEUE_MAX_ATTEMPTS,
	graphRebuildRetryDelaySeconds,
	RebuildQueueProcessor,
} from "./services/graph/rebuild-queue-processor";
import { RebuildQueueService } from "./services/graph/rebuild-queue-service";
import { RebuildTriggerService } from "./services/graph/rebuild-trigger-service";
import { ShardEmbeddingQueueProcessor } from "./services/graph/shard-embedding-queue-processor";
import type { RebuildQueueMessage } from "./types/rebuild-queue";
import type { ShardEmbeddingQueueMessage } from "./types/shard-embedding-queue";

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
		const log = createLogger(this.env, "[FileProcessingQueue]");
		const startTime = Date.now();
		const { key, contentType, tenant, originalName } = message;

		log.debug("Starting processing", { key });

		try {
			const r2Helper = new R2Helper(this.env);
			const fileSplitter = new FileSplitter();

			// Download file from staging
			const fileContent = await r2Helper.get(key);
			if (!fileContent) {
				throw new Error(`File not found in staging: ${key}`);
			}

			log.debug("Downloaded from staging", {
				bytes: fileContent.byteLength,
				key,
			});

			// Check if file needs splitting (≤ 4MB can be promoted directly)
			const maxShardSize = 4 * 1024 * 1024; // 4MB

			if (fileContent.byteLength <= maxShardSize) {
				// Promote directly to library storage
				const destKey = `library/${tenant}/${originalName}`;

				// Check if destination already exists (idempotent)
				if (!(await r2Helper.exists(destKey))) {
					await r2Helper.put(destKey, fileContent, contentType);
					log.debug("Promoted file directly", { key, destKey });
				} else {
					log.debug("Destination already exists, skipping", { destKey });
				}

				// Update file status in database for directly promoted files
				const fileDAO = getDAOFactory(this.env).fileDAO;
				try {
					await fileDAO.updateFileStatusByKey(destKey, "processed");
					log.debug("Updated file status to processed", { destKey });
				} catch (error) {
					log.error("Failed to update file status", error);
				}
			} else {
				// Split file into shards
				const splitResult = await fileSplitter.splitFile(fileContent, {
					maxShardSize,
					contentType,
					originalFilename: originalName,
					tenant,
				});

				log.debug("Split into shards", {
					shardCount: splitResult.shards.length,
					key,
				});

				// Upload shards to library storage
				for (const shard of splitResult.shards) {
					// Check if shard already exists (idempotent)
					if (!(await r2Helper.exists(shard.key))) {
						await r2Helper.put(shard.key, shard.content, shard.contentType);
					} else {
						log.debug("Shard already exists, skipping", {
							shardKey: shard.key,
						});
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
					log.debug("Uploaded manifest", { manifestKey });
				} else {
					log.debug("Manifest already exists, skipping", { manifestKey });
				}
			}

			// Update file status in database to mark as processed
			const fileDAO = getDAOFactory(this.env).fileDAO;
			const fileKey = `library/${tenant}/${originalName}`;

			try {
				await fileDAO.updateFileStatusByKey(fileKey, "processed");
				log.debug("Updated file status to processed", { fileKey });
			} catch (error) {
				log.error("Failed to update file status", error);
				// Don't fail the entire process if database update fails
			}

			// Clean up staging file
			await r2Helper.delete(key);

			const processingTime = Date.now() - startTime;
			log.debug("Completed processing", {
				key,
				processingTimeMs: processingTime,
			});
			void new TelemetryService(new TelemetryDAO(this.env.DB))
				.recordFileProcessingDuration(processingTime, {
					metadata: {
						pipeline: "library_queue",
						username: tenant,
						fileKey,
					},
				})
				.catch(() => {});
		} catch (error) {
			const processingTime = Date.now() - startTime;
			log.error("Error processing", error, {
				key,
				processingTimeMs: processingTime,
			});
			throw error;
		}
	}

	/**
	 * Handle queue messages
	 */
	async handleMessage(message: ProcessingMessage): Promise<void> {
		const log = createLogger(this.env, "[FileProcessingQueue]");
		const maxRetries = 3;
		let retryCount = 0;
		const startTime = Date.now();

		while (retryCount < maxRetries) {
			try {
				await this.processFile(message);
				return; // Success, exit retry loop
			} catch (error) {
				retryCount++;
				log.error("Attempt failed", error);

				if (retryCount >= maxRetries) {
					log.error("Max retries exceeded for", message.key, error);
					const processingTime = Date.now() - startTime;
					await this.env.FILE_PROCESSING_DLQ.send({
						originalMessage: message,
						error: error instanceof Error ? error.message : "Unknown error",
						timestamp: new Date().toISOString(),
						processingTime,
					});
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
		const log = createLogger(this.env, "[FileProcessingQueue]");
		try {
			const r2Helper = new R2Helper(this.env);
			const deletedCount = await r2Helper.cleanupOldStagingObjects(24); // 24 hours
			log.debug("Cleaned up old staging files", { deletedCount });
		} catch (error) {
			log.error("Error cleaning up staging", error);
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
		const log = createLogger(this.env, "[FileProcessingQueue]");
		const startTime = Date.now();

		try {
			const r2Helper = new R2Helper(this.env);
			const stats = await r2Helper.getBucketStats();

			return {
				...stats,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			log.error("Error getting stats", error);
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

// Type guard to check if message is a shard embedding queue message
function isShardEmbeddingQueueMessage(
	message: any
): message is ShardEmbeddingQueueMessage {
	return (
		message &&
		typeof message === "object" &&
		message.type === "shard_embedding" &&
		Array.isArray(message.entityIds) &&
		typeof message.campaignId === "string" &&
		typeof message.username === "string"
	);
}

// Export the queue handler function for Wrangler
export async function queue(
	batch: MessageBatch<
		ProcessingMessage | RebuildQueueMessage | ShardEmbeddingQueueMessage
	>,
	env: Env
): Promise<void> {
	const log = createLogger(env, "[Queue]");
	log.debug("Processing messages", { count: batch.messages.length });

	const fileProcessor = new FileProcessingQueue(env);
	const rebuildProcessor = new RebuildQueueProcessor(env);
	const shardEmbeddingProcessor = new ShardEmbeddingQueueProcessor(env);

	for (const message of batch.messages) {
		try {
			// Route to appropriate processor based on message type
			if (isRebuildQueueMessage(message.body)) {
				const q = message as Message<RebuildQueueMessage>;
				const body = q.body;
				const result = await rebuildProcessor.processRebuild(body, {
					queueAttempt: q.attempts,
					maxAttempts: GRAPH_REBUILD_QUEUE_MAX_ATTEMPTS,
				});
				log.info("graph_rebuild_queue_message_finished", {
					campaignId: body.campaignId,
					rebuildId: body.rebuildId,
					triggeredBy: body.triggeredBy,
					success: result.success,
					queueAttempt: q.attempts,
				});
				if (result.success) {
					q.ack();
				} else if (q.attempts < GRAPH_REBUILD_QUEUE_MAX_ATTEMPTS) {
					q.retry({
						delaySeconds: graphRebuildRetryDelaySeconds(q.attempts),
					});
				} else {
					q.ack();
				}
			} else if (isShardEmbeddingQueueMessage(message.body)) {
				await shardEmbeddingProcessor.handleMessage(message.body);
				message.ack();
			} else {
				await fileProcessor.handleMessage(message.body as ProcessingMessage);
				message.ack();
			}
		} catch (error) {
			if (isRebuildQueueMessage(message.body)) {
				const q = message as Message<RebuildQueueMessage>;
				log.error("Failed to process graph rebuild message", error);
				if (q.attempts < GRAPH_REBUILD_QUEUE_MAX_ATTEMPTS) {
					q.retry({
						delaySeconds: graphRebuildRetryDelaySeconds(q.attempts),
					});
				} else {
					q.ack();
				}
			} else {
				log.error("Failed to process message", error);
				message.retry();
			}
		}
	}
}

/** Frequent cron: queues, chunk processing, cleanup (see wrangler `triggers.crons`). */
export const CRON_SCHEDULE_FAST = "*/5 * * * *";
/** Less frequent cron: graph rebuild decisions and checklist LLM analysis (cost-sensitive). */
export const CRON_SCHEDULE_HEAVY = "*/15 * * * *";

export async function scheduled(
	event: ScheduledController,
	env: Env,
	ctx?: ExecutionContext
): Promise<void> {
	const cron = event.cron;
	if (!cron) {
		await runFastScheduledTasks(env, ctx);
		await runHeavyScheduledTasks(env, ctx);
		return;
	}
	if (cron === CRON_SCHEDULE_HEAVY) {
		await runHeavyScheduledTasks(env, ctx);
		return;
	}
	if (cron === CRON_SCHEDULE_FAST) {
		await runFastScheduledTasks(env, ctx);
		return;
	}
	await runFastScheduledTasks(env, ctx);
	await runHeavyScheduledTasks(env, ctx);
}

async function runFastScheduledTasks(
	env: Env,
	_ctx?: ExecutionContext
): Promise<void> {
	const log = createLogger(env, "[Scheduled]");
	try {
		const daoFactory = getDAOFactory(env);
		await daoFactory.llmUsageDAO.pruneOldRows();
	} catch (error) {
		log.error("Failed to prune LLM usage log", error);
	}

	const processor = new FileProcessingQueue(env);
	await processor.cleanupStaging();

	await processPendingSyncQueueItems(env);

	await EntityExtractionQueueService.processPendingQueueItems(env);

	await LibraryEntityDiscoveryQueueService.processPendingQueueItems(env);

	await processPendingFileChunks(env);

	await cleanupStuckProcessingFiles(env, 10);
}

async function runHeavyScheduledTasks(
	env: Env,
	ctx?: ExecutionContext
): Promise<void> {
	const log = createLogger(env, "[ScheduledHeavy]");
	await checkAndTriggerRebuilds(env);

	const analyzePromise = ChecklistStatusService.analyzeAllCampaigns(env).catch(
		(error) => {
			log.error("Failed to analyze checklist status for campaigns", error);
		}
	);
	if (ctx) {
		ctx.waitUntil(analyzePromise);
	} else {
		void analyzePromise;
	}
}

/**
 * Check campaigns with unapplied changelog entries and trigger rebuilds if needed
 * Also checks for campaigns with new entities created since the last rebuild
 */
async function checkAndTriggerRebuilds(env: Env): Promise<void> {
	const log = createLogger(env, "[RebuildCron]");
	try {
		if (!env.DB) {
			log.warn("DB binding not configured, skipping rebuild checks");
			return;
		}
		const daoFactory = getDAOFactory(env);
		const worldStateChangelogDAO = new WorldStateChangelogDAO(env.DB);
		const rebuildTriggerService = new RebuildTriggerService(
			daoFactory.campaignDAO
		);

		// Get campaigns with unapplied changelog entries
		const changelogCampaignIds =
			await worldStateChangelogDAO.getCampaignIdsWithUnappliedEntries();

		// Get all campaigns that have entities (to check for new entities without changelog entries)
		const allCampaignsWithEntities =
			await daoFactory.entityDAO.getCampaignIdsWithEntities();

		const allCampaignIds = new Set<string>();
		for (const id of changelogCampaignIds) {
			allCampaignIds.add(id);
		}
		for (const id of allCampaignsWithEntities) {
			allCampaignIds.add(id);
		}

		if (allCampaignIds.size === 0) {
			log.debug("No campaigns found to check for rebuild needs");
			return;
		}

		log.debug("Checking campaigns for rebuild needs", {
			total: allCampaignIds.size,
			withChangelog: changelogCampaignIds.length,
		});

		if (!env.GRAPH_REBUILD_QUEUE) {
			log.warn(
				"GRAPH_REBUILD_QUEUE binding not configured, skipping rebuild checks"
			);
			return;
		}

		const queueService = new RebuildQueueService(env.GRAPH_REBUILD_QUEUE);

		for (const campaignId of allCampaignIds) {
			try {
				// Check if there's already an active rebuild
				const activeRebuilds =
					await daoFactory.rebuildStatusDAO.getActiveRebuilds(campaignId);
				if (activeRebuilds.length > 0) {
					log.debug("Campaign already has active rebuild, skipping", {
						campaignId,
					});
					continue;
				}

				const deferGraphJobs = await campaignHasActiveDocumentProcessing(
					env,
					campaignId
				);

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

				// Also check for entities created since the last rebuild
				// Get the last completed rebuild to determine the cutoff time
				const rebuildHistory =
					await daoFactory.rebuildStatusDAO.getRebuildHistory(campaignId, {
						status: "completed",
						limit: 1,
					});
				const lastRebuildTime =
					rebuildHistory.length > 0 && rebuildHistory[0].completedAt
						? rebuildHistory[0].completedAt
						: null;

				if (lastRebuildTime) {
					// Get entities created after the last rebuild
					const newEntityIds =
						await daoFactory.entityDAO.getEntityIdsCreatedAfter(
							campaignId,
							lastRebuildTime
						);
					if (newEntityIds.length > 0) {
						log.debug("Found new entities created since last rebuild", {
							count: newEntityIds.length,
							campaignId,
						});
						for (const id of newEntityIds) {
							affectedEntityIds.add(id);
						}
						// Record impact for new entities (net new to graph since last rebuild)
						const totalImpact = newEntityIds.length * IMPACT_PER_NEW_ENTITY;
						await rebuildTriggerService.recordImpact(campaignId, totalImpact);
						log.debug("Recorded impact for new entities", {
							impact: totalImpact,
							count: newEntityIds.length,
						});
					}
				} else {
					// No previous rebuild - check if there are any entities at all
					// If there are entities but no rebuild, we should trigger a rebuild
					const entityCount =
						await daoFactory.entityDAO.getEntityCountByCampaign(campaignId);
					if (entityCount > 0) {
						log.debug("Campaign has entities but no previous rebuild", {
							campaignId,
							entityCount,
						});
						// Get all entity IDs for the rebuild decision
						const allEntities =
							await daoFactory.entityDAO.listEntitiesByCampaign(campaignId);
						for (const entity of allEntities) {
							affectedEntityIds.add(entity.id);
						}
						// Record impact for all entities (treat as new entities)
						const totalImpact = entityCount * IMPACT_PER_NEW_ENTITY;
						await rebuildTriggerService.recordImpact(campaignId, totalImpact);
						log.debug("Recorded impact for entities (no previous rebuild)", {
							totalImpact,
							entityCount,
						});
					}
				}

				// Check for communities with fallback names and generate summaries directly
				if (
					!deferGraphJobs &&
					daoFactory.communityDAO &&
					daoFactory.communitySummaryDAO
				) {
					const communities =
						await daoFactory.communityDAO.listCommunitiesByCampaign(campaignId);
					const communitiesWithFallbackNames: Community[] = [];

					for (const community of communities) {
						const summary =
							await daoFactory.communitySummaryDAO.getSummaryByCommunityId(
								community.id,
								campaignId
							);
						// Community has fallback name if no summary or summary has no valid name
						const hasFallbackName =
							!summary?.name ||
							typeof summary.name !== "string" ||
							summary.name.trim().length === 0;

						if (hasFallbackName) {
							communitiesWithFallbackNames.push(community);
						}
					}

					if (communitiesWithFallbackNames.length > 0) {
						log.debug(
							"Found communities with fallback names, generating summaries",
							{
								count: communitiesWithFallbackNames.length,
								campaignId,
							}
						);

						const providerKeyEnvVar =
							MODEL_CONFIG.PROVIDER.DEFAULT === "anthropic"
								? "ANTHROPIC_API_KEY"
								: "OPENAI_API_KEY";
						const providerApiKeyRaw = await getEnvVar(
							env,
							providerKeyEnvVar,
							false
						);
						const providerApiKey = providerApiKeyRaw.trim() || undefined;

						if (providerApiKey) {
							// Create summary service
							const summaryService = new CommunitySummaryService(
								daoFactory.entityDAO,
								daoFactory.communitySummaryDAO,
								providerApiKey
							);

							// Generate summaries for all communities with fallback names
							let successCount = 0;
							let errorCount = 0;

							for (const community of communitiesWithFallbackNames) {
								try {
									await summaryService.generateOrGetSummary(community, {
										providerApiKey,
									});
									successCount++;
									log.debug("Generated summary for community", {
										communityId: community.id,
									});
								} catch (error) {
									errorCount++;
									log.error("Failed to generate summary for community", error, {
										communityId: community.id,
									});
									// Continue with other communities even if one fails
								}
							}

							log.debug("Summary generation complete", {
								successCount,
								errorCount,
							});
						} else {
							log.warn(
								`${MODEL_CONFIG.PROVIDER.DEFAULT} API key not available, skipping summary generation for ${communitiesWithFallbackNames.length} communities`
							);
						}
					}
				}

				// Make rebuild decision based on impact
				const decision = await rebuildTriggerService.makeRebuildDecision(
					campaignId,
					Array.from(affectedEntityIds)
				);

				if (decision.shouldRebuild && deferGraphJobs) {
					log.debug(
						"Deferring graph rebuild until document processing completes",
						{
							campaignId,
							rebuildType: decision.rebuildType,
						}
					);
				}

				if (decision.shouldRebuild && !deferGraphJobs) {
					log.debug("Triggering rebuild for campaign", {
						rebuildType: decision.rebuildType,
						campaignId,
						impact: decision.cumulativeImpact,
					});

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

					log.info("graph_rebuild_enqueued", {
						rebuildId,
						campaignId,
						triggeredBy: "scheduled",
					});
				} else {
					log.debug("Campaign does not need rebuild", {
						campaignId,
						impact: decision.cumulativeImpact,
					});
				}
			} catch (error) {
				log.error("Error checking campaign", error, { campaignId });
				// Continue with next campaign
			}
		}

		// Shard approve/reject marks graph_dirty_* but skips enqueue while documents are processing.
		// Enqueue rebuilds once processing is clear and no active rebuild is running.
		const dirtyCampaignIds =
			await daoFactory.graphRebuildDirtyDAO.listCampaignIdsWithAnyDirty();
		for (const dirtyCampaignId of dirtyCampaignIds) {
			try {
				if (await campaignHasActiveDocumentProcessing(env, dirtyCampaignId)) {
					continue;
				}
				const active =
					await daoFactory.rebuildStatusDAO.getActiveRebuildForCampaign(
						dirtyCampaignId
					);
				if (active) {
					continue;
				}
				const result =
					await daoFactory.rebuildTriggerService.decideAndEnqueueRebuild({
						campaignId: dirtyCampaignId,
						triggeredBy: "scheduled_dirty_flush",
						requestedRadius: 2,
						dirtyEntitySeedIds: [],
						queueService,
					});
				if (result.enqueued) {
					log.info("graph_rebuild_enqueued", {
						campaignId: dirtyCampaignId,
						rebuildId: result.rebuildId,
						triggeredBy: "scheduled_dirty_flush",
					});
				}
			} catch (error) {
				log.error("Error flushing deferred graph rebuild", error, {
					campaignId: dirtyCampaignId,
				});
			}
		}
	} catch (error) {
		log.error("Error in rebuild check", error);
	}
}

/**
 * Process pending sync queue items for all users
 * This runs periodically to retry processing queued files
 */
async function processPendingSyncQueueItems(env: Env): Promise<void> {
	const log = createLogger(env, "[SyncQueue]");
	try {
		const fileDAO = getDAOFactory(env).fileDAO;

		// Get all usernames with pending queue items
		const usernames = await fileDAO.getUsernamesWithPendingQueueItems();

		if (usernames.length === 0) {
			log.debug("No pending queue items to process");
			return;
		}

		log.debug("Processing queue for users with pending items", {
			userCount: usernames.length,
		});

		let totalProcessed = 0;
		for (const username of usernames) {
			try {
				const result = await SyncQueueService.processSyncQueue(env, username);
				totalProcessed += result.processed;
				if (result.processed > 0) {
					log.debug("Processed items for user", {
						processed: result.processed,
						username,
					});
				}
			} catch (error) {
				log.error("Failed to process queue for user", error, { username });
				// Continue processing other users even if one fails
			}
		}

		if (totalProcessed > 0) {
			log.debug("Completed processing", { totalProcessed });
		}
	} catch (error) {
		log.error("Error processing pending sync queue items", error);
	}
}

/**
 * Process pending file chunks for files that have been split into chunks
 */
async function processPendingFileChunks(env: Env): Promise<void> {
	const log = createLogger(env, "[ChunkProcessor]");
	try {
		const fileDAO = getDAOFactory(env).fileDAO;
		const chunkedService = new ChunkedProcessingService(env);

		// Get all files with pending chunks
		const pendingChunks = await fileDAO.getPendingFileChunks();

		if (pendingChunks.length === 0) {
			log.debug("No pending file chunks to process");
			return;
		}

		log.debug("Processing pending chunks", { count: pendingChunks.length });

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
					log.error("File not found", fileKey);
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
					log.error("File metadata not found", fileKey);
					continue;
				}

				const contentType =
					dbMetadata.content_type || file.httpMetadata?.contentType || "";
				const metadataId = dbMetadata.file_key;

				// Determine if we should load the full buffer based on file size
				// If file is chunked, it's too large to load in memory - skip trying
				const fileSizeMB = (dbMetadata.file_size || 0) / (1024 * 1024);
				const MEMORY_LIMIT_MB = PROCESSING_LIMITS.MEMORY_LIMIT_MB;
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
						log.warn(
							"Failed to load full file buffer, will fetch per chunk",
							bufferError instanceof Error
								? bufferError.message
								: String(bufferError)
						);
						usePerChunkFetch = true;
					}
				} else {
					log.debug(
						"Skipping full buffer load - file too large, will fetch per chunk",
						{
							fileKey,
							fileSizeMB: fileSizeMB.toFixed(2),
						}
					);
				}

				// Process each chunk
				for (const chunk of chunks) {
					try {
						let chunkBuffer: ArrayBuffer;
						const hasByteRange =
							chunk.byteRangeStart != null && chunk.byteRangeEnd != null;

						if (hasByteRange) {
							// Non-PDF: fetch only this chunk's byte range from R2 (avoids loading full file)
							const rangeLength =
								(chunk.byteRangeEnd ?? 0) - (chunk.byteRangeStart ?? 0);
							const rangeObject = await env.R2.get(fileKey, {
								range: {
									offset: chunk.byteRangeStart ?? 0,
									length: rangeLength,
								},
							});
							if (!rangeObject) {
								throw new Error("File or range not found in R2");
							}
							chunkBuffer = await rangeObject.arrayBuffer();
						} else if (usePerChunkFetch) {
							// PDF chunk and file too large for full buffer: use R2 range transport
							const isPdfChunk =
								contentType.includes("pdf") &&
								chunk.pageRangeStart != null &&
								chunk.pageRangeEnd != null;
							const fileSize = dbMetadata.file_size ?? 0;

							if (isPdfChunk && fileSize > 0) {
								const chunkDef = {
									chunkIndex: chunk.chunkIndex,
									totalChunks: chunk.totalChunks,
									pageRangeStart: chunk.pageRangeStart,
									pageRangeEnd: chunk.pageRangeEnd,
									byteRangeStart: chunk.byteRangeStart,
									byteRangeEnd: chunk.byteRangeEnd,
								};
								await chunkedService.processPdfChunkWithR2Range(
									chunk.id,
									fileKey,
									chunkDef,
									fileSize,
									contentType,
									metadataId
								);
								log.debug("Successfully processed PDF chunk (R2 range)", {
									chunkIndex: chunk.chunkIndex + 1,
									totalChunks: chunk.totalChunks,
									fileKey,
								});
							} else {
								// Non-PDF or missing page range: must load full file (may OOM)
								const chunkFile = await env.R2.get(fileKey);
								if (!chunkFile) {
									throw new Error("File not found in R2");
								}
								try {
									chunkBuffer = await chunkFile.arrayBuffer();
								} catch (chunkBufferError) {
									throw new Error(
										`File too large to process: ${chunkBufferError instanceof Error ? chunkBufferError.message : "Memory limit exceeded"}`
									);
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
							}
							continue;
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

						log.debug("Successfully processed chunk", {
							chunkIndex: chunk.chunkIndex + 1,
							totalChunks: chunk.totalChunks,
							fileKey,
						});
					} catch (chunkError) {
						const errorMessage =
							chunkError instanceof Error
								? chunkError.message
								: String(chunkError);
						log.error("Failed to process chunk", chunkError);

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
					log.debug("All chunks complete for file", { fileKey });
				} else if (mergeResult.allComplete && !mergeResult.allSuccessful) {
					// Some chunks failed - mark file as error (use MEMORY_LIMIT_EXCEEDED if applicable)
					const msg = mergeResult.firstFailedErrorMessage ?? "";
					if (msg.startsWith("MEMORY_LIMIT_EXCEEDED:")) {
						await fileDAO.updateFileRecordWithError(
							fileKey,
							FileDAO.STATUS.ERROR,
							"MEMORY_LIMIT_EXCEEDED",
							msg.slice("MEMORY_LIMIT_EXCEEDED:".length).trim()
						);
					} else {
						await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.ERROR);
					}
					log.error("Some chunks failed for file", mergeResult.stats);
				}
			} catch (fileError) {
				log.error("Error processing chunks for file", fileError, {
					fileKey,
				});
			}
		}
	} catch (error) {
		log.error("Error processing pending file chunks", error);
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
	const log = createLogger(env, "[ScheduledCleanup]");
	try {
		const fileDAO = getDAOFactory(env).fileDAO;

		// Get files stuck in processing or syncing for the specified timeout
		const allStuckFiles = await fileDAO.getStuckProcessingFiles(timeoutMinutes);

		// Filter to specific file if requested
		const stuckFiles = fileKey
			? allStuckFiles.filter((f) => f.file_key === fileKey)
			: allStuckFiles;

		if (stuckFiles.length > 0) {
			log.debug("Found files stuck in processing/syncing status", {
				count: stuckFiles.length,
			});

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
					log.error("Failed to notify user about timeout", notifyError, {
						username: file.username,
					});
				}

				log.debug("Marked file as failed due to timeout", {
					fileName: file.file_name,
				});
			}

			log.debug("Cleaned up stuck files", { count: stuckFiles.length });

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
		log.error("Error cleaning up stuck processing files", error);
		return { cleaned: 0, files: [] };
	}
}
