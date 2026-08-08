import { getDAOFactory } from "@/dao/dao-factory";
import {
	LibraryEntityDAO,
	type LibraryEntityDiscoveryRow,
} from "@/dao/library-entity-dao";
import {
	formatBatchWaitingMarker,
	parseEntityExtractionBatchState,
	parseEntityExtractionProgress,
	queueMessageWithProgress,
} from "@/lib/entity-extraction-progress";
import { getEnvVar } from "@/lib/env-utils";
import {
	buildLibraryContentFingerprint,
	buildLibraryEntityMergeKey,
	extractionIdSuffix,
	getLibrarySyntheticCampaignId,
} from "@/lib/library-entity-id";
import { createLogger } from "@/lib/logger";
import type { Env } from "@/middleware/auth";
import { stageLibraryEntitiesFromFile } from "@/services/campaign/entity-staging-service";
import { processPendingCampaignEntityCopiesForFile } from "@/services/campaign/pending-campaign-entity-copy";
import { EntityExtractionBatchService } from "@/services/llm/entity-extraction-batch-service";
import { isBatchExtractionEnabled } from "@/services/llm/llm-batch-config";
import { notifyLibraryDiscoveryTerminalFailure } from "@/services/support/library-pipeline-support";

const MAX_CHUNKS_PER_RUN = 12;
const MAX_JOBS_PER_SCHEDULED_RUN = 8;

async function recordDiscoveryError(
	env: Env,
	libDao: LibraryEntityDAO,
	row: LibraryEntityDiscoveryRow,
	error: string,
	opts: { failImmediately?: boolean } = {}
): Promise<"failed" | "retry_scheduled"> {
	const out = await libDao.recordDiscoveryFailureWithRetry(
		row.file_key,
		error,
		{ failImmediately: opts.failImmediately }
	);
	if (out === "failed") {
		const disc = await libDao.getDiscovery(row.file_key);
		const retryCount = disc?.retry_count ?? row.retry_count;
		try {
			if (env.FILE_PROCESSING_DLQ) {
				await env.FILE_PROCESSING_DLQ.send({
					kind: "library_entity_discovery" as const,
					fileKey: row.file_key,
					username: row.username,
					error,
					retryCount,
					timestamp: new Date().toISOString(),
				});
			}
		} catch (dlqErr) {
			createLogger(env, "[LibraryEntityDiscovery]").error(
				"dlq_send_failed",
				dlqErr
			);
		}
		if (!row.support_escalated_at) {
			try {
				await notifyLibraryDiscoveryTerminalFailure(env, {
					fileKey: row.file_key,
					username: row.username,
					error,
					retryCount,
				});
				await libDao.setSupportEscalatedNow(row.file_key);
			} catch (supportErr) {
				createLogger(env, "[LibraryEntityDiscovery]").error(
					"support_notify_failed",
					supportErr
				);
			}
		}
	}
	return out;
}

type DiscoveryLogger = ReturnType<typeof createLogger>;

/**
 * Build the Anthropic message-batch coordinator for this job, or undefined when
 * batching is off (issue #735). `onStatus` keeps the `PROGRESS` cursor and adds
 * a batch marker so the UI can say "queued" rather than looking stalled.
 */
async function buildBatchCoordinator(params: {
	env: Env;
	row: LibraryEntityDiscoveryRow;
	libDao: LibraryEntityDAO;
	llmApiKey: string;
	fingerprint: string;
}): Promise<EntityExtractionBatchService | undefined> {
	const { env, row, libDao, llmApiKey, fingerprint } = params;
	if (!(await isBatchExtractionEnabled(env))) {
		return undefined;
	}
	return new EntityExtractionBatchService({
		env,
		username: row.username,
		fileKey: row.file_key,
		llmApiKey,
		contentFingerprint: fingerprint,
		onStatus: async (status) => {
			if (status.kind !== "awaiting") {
				return;
			}
			await libDao.updateDiscoveryQueueMessage(
				row.file_key,
				queueMessageWithProgress(
					row.queue_message,
					formatBatchWaitingMarker(status.chunkCount, status.submittedAt)
				)
			);
		},
	});
}

/**
 * If the job's batch is still running, requeue it at the same cursor and report
 * true so the caller skips staging entirely this tick.
 */
async function requeueIfBatchPending(params: {
	libDao: LibraryEntityDAO;
	row: LibraryEntityDiscoveryRow;
	coordinator: EntityExtractionBatchService;
	resumeFromChunk: number;
	totalChunks: number;
	log: DiscoveryLogger;
}): Promise<boolean> {
	const { libDao, row, coordinator, resumeFromChunk, totalChunks, log } =
		params;
	const pending = await coordinator.peekPendingBatch();
	if (!pending.waiting) {
		return false;
	}
	const marker = formatBatchWaitingMarker(
		pending.chunkCount ?? 0,
		pending.submittedAt ?? ""
	);
	await libDao.markDiscoveryPendingResume(
		row.file_key,
		totalChunks > 0
			? queueMessageWithProgress(
					`PROGRESS:${resumeFromChunk}/${totalChunks}`,
					marker
				)
			: marker
	);
	log.info("library_entity_discovery_batch_pending", {
		fileKey: row.file_key,
		chunkCount: pending.chunkCount,
	});
	return true;
}

/**
 * Requeue a job whose staging run submitted a batch and produced nothing yet.
 * The resume cursor does not advance, and `retry_count` is untouched — waiting
 * on a batch is neither progress nor failure.
 */
async function requeueAwaitingBatch(params: {
	libDao: LibraryEntityDAO;
	row: LibraryEntityDiscoveryRow;
	resumeFromChunk: number;
	totalChunks: number;
	log: DiscoveryLogger;
}): Promise<void> {
	const { libDao, row, resumeFromChunk, totalChunks, log } = params;
	// The coordinator's onStatus already wrote the batch marker; re-read it so
	// requeueing preserves it alongside the resume cursor.
	const currentMessage =
		(await libDao.getDiscovery(row.file_key))?.queue_message ??
		row.queue_message;
	const batchState = parseEntityExtractionBatchState(currentMessage);
	const marker = batchState
		? formatBatchWaitingMarker(batchState.chunkCount, batchState.submittedAt)
		: "";
	const resumeMessage =
		totalChunks > 0
			? queueMessageWithProgress(
					`PROGRESS:${resumeFromChunk}/${totalChunks}`,
					marker
				)
			: (currentMessage ?? "");
	await libDao.markDiscoveryPendingResume(row.file_key, resumeMessage);
	log.info("library_entity_discovery_awaiting_batch", {
		fileKey: row.file_key,
		resumeFromChunk,
		totalChunks,
	});
}

function candidateConfidence(metadata: unknown): number | null {
	if (typeof metadata !== "object" || metadata === null) {
		return null;
	}
	const value = (metadata as Record<string, unknown>).confidence;
	return typeof value === "number" ? value : null;
}

/** Write a completed run's candidates and (deduplicated) relationships. */
async function persistDiscoveryResults(
	libDao: LibraryEntityDAO,
	row: LibraryEntityDiscoveryRow,
	staged: NonNullable<
		Awaited<ReturnType<typeof stageLibraryEntitiesFromFile>>["stagedEntities"]
	>
): Promise<void> {
	for (const se of staged) {
		await libDao.upsertCandidate({
			id: crypto.randomUUID(),
			fileKey: row.file_key,
			username: row.username,
			mergeKey: buildLibraryEntityMergeKey(se.entityType, se.name),
			entityType: se.entityType,
			name: se.name,
			content: se.content,
			metadata: se.metadata,
			confidence: candidateConfidence(se.metadata),
			extractionEntityId: se.id,
			idSuffix: extractionIdSuffix(se.id),
		});
	}

	await libDao.deleteRelationshipsForFile(row.file_key);

	const relDedup = new Set<string>();
	for (const se of staged) {
		for (const rel of se.relations) {
			const key = `${se.id}:${rel.targetId}:${rel.relationshipType}`;
			if (relDedup.has(key)) continue;
			relDedup.add(key);
			await libDao.upsertRelationship({
				id: crypto.randomUUID(),
				fileKey: row.file_key,
				fromExtractionEntityId: se.id,
				toExtractionEntityId: rel.targetId,
				relationshipType: rel.relationshipType,
				strength: rel.strength ?? null,
				metadata: rel.metadata ?? {},
			});
		}
	}
}

/**
 * After library indexing completes, queue one LLM pass per file_key. Results are stored in
 * `library_entity_*` tables and copied into campaigns when a resource is added (see copy service).
 */
export class LibraryEntityDiscoveryQueueService {
	static async queueDiscoveryAfterIndexing(
		env: Env,
		fileKey: string,
		username: string
	): Promise<void> {
		const libDao = new LibraryEntityDAO(env.DB);
		if (!(await libDao.isSchemaReady())) {
			return;
		}
		await libDao.upsertDiscoveryPending(fileKey, username);
		LibraryEntityDiscoveryQueueService.processQueue(env).catch(() => {});
	}

	static async processQueue(
		env: Env,
		maxItems: number = MAX_JOBS_PER_SCHEDULED_RUN
	): Promise<{ processed: number; failed: number }> {
		const libDao = new LibraryEntityDAO(env.DB);
		if (!(await libDao.isSchemaReady())) {
			return { processed: 0, failed: 0 };
		}

		const pending = await libDao.listPendingDiscovery(maxItems);
		if (pending.length === 0) {
			return { processed: 0, failed: 0 };
		}

		const daoFactory = getDAOFactory(env);
		let processed = 0;
		let failed = 0;
		const log = createLogger(env, "[LibraryEntityDiscovery]");

		for (const row of pending) {
			try {
				const claimed = await libDao.claimDiscoveryForProcessing(row.file_key);
				if (!claimed) {
					log.debug("library_entity_discovery_claim_skipped", {
						fileKey: row.file_key,
					});
					continue;
				}

				const fileRecord = await daoFactory.fileDAO.getFileForRag(
					row.file_key,
					row.username
				);
				if (!fileRecord) {
					const out = await recordDiscoveryError(
						env,
						libDao,
						row,
						"File not found",
						{ failImmediately: true }
					);
					if (out === "failed") failed++;
					else processed++;
					continue;
				}
				if (fileRecord.status !== "completed") {
					const out = await recordDiscoveryError(
						env,
						libDao,
						row,
						`File not ready for discovery (status=${fileRecord.status})`
					);
					if (out === "failed") failed++;
					else processed++;
					continue;
				}

				const llmApiKeyRaw = await getEnvVar(env, "ANTHROPIC_API_KEY", false);
				const llmApiKey = llmApiKeyRaw.trim();
				if (!llmApiKey) {
					const out = await recordDiscoveryError(
						env,
						libDao,
						row,
						"anthropic API key not configured"
					);
					if (out === "failed") failed++;
					else processed++;
					continue;
				}
				const openaiApiKeyRaw = await getEnvVar(env, "OPENAI_API_KEY", false);
				const openaiApiKey = openaiApiKeyRaw.trim() || undefined;

				const lastSlash = row.file_key.lastIndexOf("/");
				const campaignRagBasePath =
					lastSlash >= 0
						? row.file_key.slice(0, lastSlash + 1)
						: `library/${row.username}/`;

				const syntheticCampaignId = getLibrarySyntheticCampaignId(row.file_key);
				const resource = {
					id: row.file_key,
					file_key: row.file_key,
					file_name: fileRecord.file_name,
					campaign_id: syntheticCampaignId,
				};

				const progress = parseEntityExtractionProgress(row.queue_message ?? "");
				const resumeFromChunk = progress?.processed ?? 0;

				const fingerprint = buildLibraryContentFingerprint(
					fileRecord.file_size,
					fileRecord.updated_at
				);

				// Anthropic Message Batches (issue #735). Any problem inside the
				// coordinator resolves to inline extraction, so the flag is safe to
				// flip either way.
				const batchCoordinator = await buildBatchCoordinator({
					env,
					row,
					libDao,
					llmApiKey,
					fingerprint,
				});

				// Waiting on a batch means there is nothing to extract this tick, and
				// staging front-loads content extraction plus 1–3 character-sheet
				// detection LLM calls before it plans chunks — so bail out first.
				if (
					batchCoordinator &&
					(await requeueIfBatchPending({
						libDao,
						row,
						coordinator: batchCoordinator,
						resumeFromChunk,
						totalChunks: progress?.total ?? 0,
						log,
					}))
				) {
					processed++;
					continue;
				}

				const result = await stageLibraryEntitiesFromFile({
					env,
					username: row.username,
					fileKey: row.file_key,
					resource,
					campaignRagBasePath,
					llmApiKey,
					openaiApiKey,
					resumeFromChunk,
					maxChunksPerRun: MAX_CHUNKS_PER_RUN,
					batchCoordinator,
					onChunkCheckpoint: async ({ processedChunks, totalChunks }) => {
						await libDao.updateDiscoveryQueueMessage(
							row.file_key,
							`PROGRESS:${processedChunks}/${totalChunks}`
						);
					},
				});

				// Waiting on a batch is neither progress nor failure: requeue at the
				// same cursor without touching retry_count, so a slow batch never
				// burns the job's retry budget.
				if (result.awaitingBatch) {
					await requeueAwaitingBatch({
						libDao,
						row,
						resumeFromChunk,
						totalChunks: result.totalChunks ?? progress?.total ?? 0,
						log,
					});
					processed++;
					continue;
				}

				if (!result.success) {
					const out = await recordDiscoveryError(
						env,
						libDao,
						row,
						result.error || "Entity extraction failed"
					);
					if (out === "failed") failed++;
					else processed++;
					continue;
				}

				if (result.completed === false) {
					const nextChunk = result.nextChunkIndex ?? resumeFromChunk;
					const totalChunks = result.totalChunks ?? progress?.total ?? 0;
					const msg =
						totalChunks > 0
							? `PROGRESS:${nextChunk}/${totalChunks}`
							: (row.queue_message ?? "");
					await libDao.markDiscoveryPendingResume(row.file_key, msg);
					processed++;
					continue;
				}

				const staged = result.stagedEntities ?? [];
				await persistDiscoveryResults(libDao, row, staged);

				await libDao.markDiscoveryComplete(row.file_key, fingerprint);

				log.info("library_entity_discovery_complete", {
					fileKey: row.file_key,
					username: row.username,
					entityCount: staged.length,
				});
				await processPendingCampaignEntityCopiesForFile(
					env,
					row.file_key
				).catch((e) => {
					log.error("pending_campaign_entity_copy_failed", {
						fileKey: row.file_key,
						error: e instanceof Error ? e.message : String(e),
					});
				});
				processed++;
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				try {
					const out = await recordDiscoveryError(env, libDao, row, msg);
					if (out === "failed") failed++;
					else processed++;
				} catch {
					failed++;
				}
				log.error("library_entity_discovery_failed", {
					fileKey: row.file_key,
					error: msg,
				});
			}
		}

		return { processed, failed };
	}

	static async processPendingQueueItems(env: Env): Promise<void> {
		await LibraryEntityDiscoveryQueueService.processQueue(env, 15);
	}

	/**
	 * Reset library discovery jobs stuck in `processing` (e.g. worker timeout) to `pending`.
	 */
	static async cleanupStuckProcessingItems(
		env: Env,
		timeoutMinutes: number
	): Promise<{
		reset: number;
		items: LibraryEntityDiscoveryRow[];
	}> {
		const libDao = new LibraryEntityDAO(env.DB);
		if (!(await libDao.isSchemaReady())) {
			return { reset: 0, items: [] };
		}
		const stuck = await libDao.getStuckProcessingRows(timeoutMinutes);
		for (const row of stuck) {
			await libDao.resetStuckProcessingToPending(row.file_key);
		}
		return { reset: stuck.length, items: stuck };
	}
}
