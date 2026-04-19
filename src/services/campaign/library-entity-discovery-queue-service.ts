import { MODEL_CONFIG } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import { LibraryEntityDAO } from "@/dao/library-entity-dao";
import { parseEntityExtractionProgress } from "@/lib/entity-extraction-progress";
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

const MAX_CHUNKS_PER_RUN = 12;
const MAX_JOBS_PER_SCHEDULED_RUN = 8;

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
				await libDao.markDiscoveryProcessing(row.file_key);

				const fileRecord = await daoFactory.fileDAO.getFileForRag(
					row.file_key,
					row.username
				);
				if (!fileRecord) {
					await libDao.markDiscoveryFailed(row.file_key, "File not found");
					failed++;
					continue;
				}
				if (fileRecord.status !== "completed") {
					await libDao.markDiscoveryFailed(
						row.file_key,
						`File not ready for discovery (status=${fileRecord.status})`
					);
					failed++;
					continue;
				}

				const providerKeyEnvVar =
					MODEL_CONFIG.PROVIDER.DEFAULT === "anthropic"
						? "ANTHROPIC_API_KEY"
						: "OPENAI_API_KEY";
				const llmApiKeyRaw = await getEnvVar(env, providerKeyEnvVar, false);
				const llmApiKey = llmApiKeyRaw.trim();
				if (!llmApiKey) {
					await libDao.markDiscoveryFailed(
						row.file_key,
						`${MODEL_CONFIG.PROVIDER.DEFAULT} API key not configured`
					);
					failed++;
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
					onChunkCheckpoint: async ({ processedChunks, totalChunks }) => {
						await libDao.updateDiscoveryQueueMessage(
							row.file_key,
							`PROGRESS:${processedChunks}/${totalChunks}`
						);
					},
				});

				if (!result.success) {
					await libDao.markDiscoveryFailed(
						row.file_key,
						result.error || "Entity extraction failed"
					);
					failed++;
					continue;
				}

				if (result.completed === false) {
					const nextChunk = result.nextChunkIndex ?? resumeFromChunk;
					const totalChunks = result.totalChunks ?? progress?.total ?? 0;
					await libDao.updateDiscoveryQueueMessage(
						row.file_key,
						totalChunks > 0
							? `PROGRESS:${nextChunk}/${totalChunks}`
							: (row.queue_message ?? "")
					);
					processed++;
					continue;
				}

				const staged = result.stagedEntities ?? [];
				for (const se of staged) {
					const mergeKey = buildLibraryEntityMergeKey(se.entityType, se.name);
					const idSuffix = extractionIdSuffix(se.id);
					await libDao.upsertCandidate({
						id: crypto.randomUUID(),
						fileKey: row.file_key,
						username: row.username,
						mergeKey,
						entityType: se.entityType,
						name: se.name,
						content: se.content,
						metadata: se.metadata,
						confidence:
							typeof se.metadata === "object" &&
							se.metadata !== null &&
							typeof (se.metadata as Record<string, unknown>).confidence ===
								"number"
								? ((se.metadata as Record<string, unknown>)
										.confidence as number)
								: null,
						extractionEntityId: se.id,
						idSuffix,
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

				const fingerprint = buildLibraryContentFingerprint(
					fileRecord.file_size,
					fileRecord.updated_at
				);
				await libDao.markDiscoveryComplete(row.file_key, fingerprint);

				log.info("library_entity_discovery_complete", {
					fileKey: row.file_key,
					username: row.username,
					entityCount: staged.length,
				});
				processed++;
			} catch (e) {
				failed++;
				const msg = e instanceof Error ? e.message : String(e);
				try {
					const libDaoInner = new LibraryEntityDAO(env.DB);
					await libDaoInner.markDiscoveryFailed(row.file_key, msg);
				} catch {
					// ignore
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
}
