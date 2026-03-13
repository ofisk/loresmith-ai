// Entity staging service for campaign resources
// Extracts entities from file content and stages them for user approval/rejection

import { MODEL_CONFIG } from "@/app-constants";
import { NOTIFICATION_TYPES } from "@/constants/notification-types";
import { getDAOFactory } from "@/dao/dao-factory";
import {
	isStubContent,
	mergeEntityContent,
} from "@/lib/entity/entity-content-merge";
import { normalizeEntityType } from "@/lib/entity/entity-types";
import {
	chunkTextByCharacterCount,
	chunkTextByPages,
	truncateContentAtSentenceBoundary,
} from "@/lib/file/text-chunking-utils";
import { notifyCampaignMembers } from "@/lib/notifications";
import { R2Helper } from "@/lib/r2";
import {
	normalizeResourceForShardGeneration,
	validateShardGenerationOptions,
} from "@/lib/shard-generation-utils";
import type { Env } from "@/middleware/auth";
import { CharacterSheetDetectionService } from "@/services/character-sheet/character-sheet-detection-service";
import { CharacterSheetParserService } from "@/services/character-sheet/character-sheet-parser-service";
import { ProviderEmbeddingService } from "@/services/embedding/provider-embedding-service";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { EntityImportanceService } from "@/services/graph/entity-importance-service";
import { getLLMRateLimitService } from "@/services/llm/llm-rate-limit-service";
import type { ExtractedEntity } from "@/services/rag/entity-extraction-service";
import { EntityExtractionService } from "@/services/rag/entity-extraction-service";
import { SemanticDuplicateDetectionService } from "@/services/vectorize/semantic-duplicate-detection-service";
import type { ContentExtractionProvider } from "./content-extraction-provider";
import { DirectFileContentExtractionProvider } from "./impl/direct-file-content-extraction-provider";

export interface EntityStagingResult {
	success: boolean;
	entityCount: number;
	stagedEntities?: Array<{
		id: string;
		entityType: string;
		name: string;
		content: unknown;
		metadata: Record<string, unknown>;
		relations: Array<{
			relationshipType: string;
			targetId: string;
			strength?: number | null;
			metadata?: Record<string, unknown>;
		}>;
	}>;
	error?: string;
	warning?: string;
	failedChunks?: number[];
	successfulChunks?: number;
	totalChunks?: number;
	completed?: boolean;
	nextChunkIndex?: number;
}

export interface EntityStagingOptions {
	env: Env;
	username: string;
	campaignId: string;
	campaignName: string;
	resource: any; // CampaignResource
	campaignRagBasePath: string;
	/** LLM provider API key used for extraction/detection/parsing. */
	llmApiKey?: string;
	/** OpenAI key used for embedding-based duplicate detection (optional). */
	openaiApiKey?: string;
	/**
	 * Optional content extraction provider.
	 * If not provided, defaults to DirectFileContentExtractionProvider.
	 */
	contentExtractionProvider?: ContentExtractionProvider;
	/**
	 * When from an approved resource proposal: proposedBy = player who proposed the file,
	 * approvedBy = GM who approved. Stored in entity metadata for "co-authored by X and Y" display.
	 */
	attribution?: { proposedBy: string; approvedBy: string };
	/** Resume extraction from this chunk index (0-based). */
	resumeFromChunk?: number;
	/** Maximum chunks to process for this invocation. */
	maxChunksPerRun?: number;
	/** Optional callback for durable chunk checkpoints. */
	onChunkCheckpoint?: (progress: {
		processedChunks: number;
		totalChunks: number;
	}) => Promise<void> | void;
}

const IN_RUN_SEMANTIC_DUPLICATE_THRESHOLD = 0.9;

function buildSemanticCandidateText(name: string, content: unknown): string {
	const contentText =
		typeof content === "string" ? content : JSON.stringify(content || {});
	return `${name} ${contentText}`.trim();
}

function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length === 0 || b.length === 0 || a.length !== b.length) {
		return 0;
	}
	let dot = 0;
	let magA = 0;
	let magB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		magA += a[i] * a[i];
		magB += b[i] * b[i];
	}
	if (magA === 0 || magB === 0) return 0;
	return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function isContextLengthError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const message = error.message.toLowerCase();
	return (
		message.includes("maximum context length") ||
		message.includes("context length") ||
		message.includes("too many tokens") ||
		message.includes("reduce the length") ||
		message.includes("maximum context size") ||
		message.includes("input too long")
	);
}

/**
 * Send a notification to campaign members when entity extraction completes with 0 entities.
 * Ensures the UI surfaces this outcome so users know extraction finished but found nothing.
 */
async function notifyZeroEntitiesFound(
	env: Env,
	campaignId: string,
	campaignName: string,
	resourceId: string,
	fileName: string,
	detail?: string
): Promise<void> {
	try {
		const messageSuffix = detail ? ` ${detail}` : "";
		await notifyCampaignMembers(
			env,
			campaignId,
			campaignName,
			() => ({
				type: NOTIFICATION_TYPES.SHARDS_GENERATED,
				title: "No entities found",
				message: `🔎 No entities were discovered from "${fileName}" in "${campaignName}".${messageSuffix}`,
				data: {
					campaignName,
					fileName,
					shardCount: 0,
					campaignId,
					resourceId,
					ui_hint: {
						type: "shards_ready",
						data: {
							campaignId,
							resourceId,
							groups: undefined,
						},
					},
				},
			}),
			[]
		);
	} catch (_notifyError) {}
}

/**
 * Extract entities from file content and stage them for approval.
 * Entities are stored with shardStatus='staging' in metadata (UI uses "shard" terminology).
 *
 * Content extraction is handled by a ContentExtractionProvider (defaults to DirectFileContentExtractionProvider).
 * Large PDFs are automatically chunked and entities are merged across chunks.
 */
export async function stageEntitiesFromResource(
	options: EntityStagingOptions
): Promise<EntityStagingResult> {
	const {
		env,
		username,
		campaignId,
		campaignName,
		resource,
		campaignRagBasePath,
		llmApiKey,
		openaiApiKey,
		contentExtractionProvider,
		attribution,
		resumeFromChunk = 0,
		maxChunksPerRun,
		onChunkCheckpoint,
	} = options;

	try {
		// Validate and normalize resource
		validateShardGenerationOptions({
			env,
			username,
			campaignId,
			campaignName,
			resource,
			campaignRagBasePath,
		});

		if (!llmApiKey) {
			const normalizedResource = normalizeResourceForShardGeneration(resource);
			await notifyZeroEntitiesFound(
				env,
				campaignId,
				campaignName,
				normalizedResource.id,
				normalizedResource.file_name || normalizedResource.id,
				`${MODEL_CONFIG.PROVIDER.DEFAULT} API key was not configured.`
			);
			return {
				success: true,
				entityCount: 0,
				stagedEntities: [],
			};
		}

		const normalizedResource = normalizeResourceForShardGeneration(resource);

		// Use content extraction provider (defaults to DirectFileContentExtractionProvider if not provided)
		const provider =
			contentExtractionProvider ||
			new DirectFileContentExtractionProvider(env, new R2Helper(env));

		const extractionResult = await provider.extractContent({
			resource: normalizedResource,
		});

		if (!extractionResult.success || !extractionResult.content) {
			await notifyZeroEntitiesFound(
				env,
				campaignId,
				campaignName,
				normalizedResource.id,
				normalizedResource.file_name || normalizedResource.id,
				"The file content could not be extracted (e.g. PDF parsing failed or the document is empty)."
			);
			return {
				success: true,
				entityCount: 0,
				stagedEntities: [],
			};
		}

		const fileContent = extractionResult.content;
		const isPDF = extractionResult.metadata?.isPDF || false;

		// Check if this is a character sheet before normal entity extraction
		try {
			const detectionService = new CharacterSheetDetectionService(llmApiKey);
			const rateLimitService = getLLMRateLimitService(env);
			const detectionResult = await detectionService.detectCharacterSheet(
				fileContent,
				{
					username,
					onUsage: async (usage) => {
						await rateLimitService.recordUsage(
							username,
							usage.tokens,
							usage.queryCount
						);
					},
				}
			);

			if (detectionService.isConfidentDetection(detectionResult)) {
				// Parse the character sheet
				const parserService = new CharacterSheetParserService(llmApiKey);
				const characterData = await parserService.parseCharacterSheet(
					fileContent,
					detectionResult.characterName || undefined
				);

				// Create PC entity from parsed character data
				const daoFactory = getDAOFactory(env);
				const characterName =
					characterData.name ||
					detectionResult.characterName ||
					"Unknown Character";
				const baseId = crypto.randomUUID();
				const pcEntityId = `${campaignId}_${baseId}`;

				// Check for duplicate by name and type before creating
				const existingPC = await daoFactory.entityDAO.findEntityByNameAndType(
					campaignId,
					characterName,
					"pcs"
				);

				let finalEntityId: string;
				let finalMetadata: Record<string, unknown>;

				if (existingPC) {
					finalEntityId = existingPC.id;
					finalMetadata = {
						...((existingPC.metadata as Record<string, unknown>) || {}),
						shardStatus: "staging",
						staged: true,
						resourceId: normalizedResource.id,
						resourceName: normalizedResource.file_name || normalizedResource.id,
						fileKey: normalizedResource.file_key || normalizedResource.id,
						isCharacterSheet: true,
						detectedGameSystem: detectionResult.detectedGameSystem,
						...(attribution && {
							proposedBy: attribution.proposedBy,
							approvedBy: attribution.approvedBy,
						}),
					};
					// Update existing PC entity with new character data
					await daoFactory.entityDAO.updateEntity(existingPC.id, {
						content: characterData,
						metadata: finalMetadata,
						shardStatus: "staging",
						sourceType: "file_upload",
						sourceId: normalizedResource.id,
					});
				} else {
					// Create new PC entity
					finalEntityId = pcEntityId;
					finalMetadata = {
						shardStatus: "staging",
						staged: true,
						resourceId: normalizedResource.id,
						resourceName: normalizedResource.file_name || normalizedResource.id,
						fileKey: normalizedResource.file_key || normalizedResource.id,
						isCharacterSheet: true,
						detectedGameSystem: detectionResult.detectedGameSystem,
						...(attribution && {
							proposedBy: attribution.proposedBy,
							approvedBy: attribution.approvedBy,
						}),
					};
					await daoFactory.entityDAO.createEntity({
						id: pcEntityId,
						campaignId,
						entityType: "pcs",
						name: characterName,
						content: characterData,
						shardStatus: "staging",
						metadata: finalMetadata,
						sourceType: "file_upload",
						sourceId: normalizedResource.id,
						confidence: detectionResult.confidence,
					});
				}

				// Return early with the character sheet PC entity to avoid redundant processing
				return {
					success: true,
					entityCount: 1,
					stagedEntities: [
						{
							id: finalEntityId,
							entityType: "pcs",
							name: characterName,
							content: characterData,
							metadata: finalMetadata,
							relations: [],
						},
					],
				};
			} else {
			}
		} catch (_error) {}

		// Chunk content conservatively for provider reliability.
		// Anthropic structured extraction is far more stable with smaller chunks.
		const MAX_CHUNK_SIZE =
			MODEL_CONFIG.PROVIDER.DEFAULT === "anthropic" ? 12000 : 42464;

		const chunks =
			fileContent.length > MAX_CHUNK_SIZE
				? isPDF
					? chunkTextByPages(fileContent, MAX_CHUNK_SIZE)
					: chunkTextByCharacterCount(fileContent, MAX_CHUNK_SIZE)
				: [fileContent];
		const startChunkIndex = Math.max(
			0,
			Math.min(resumeFromChunk, Math.max(chunks.length - 1, 0))
		);
		const endChunkExclusive = maxChunksPerRun
			? Math.min(chunks.length, startChunkIndex + Math.max(1, maxChunksPerRun))
			: chunks.length;
		const chunksToProcess = chunks
			.slice(startChunkIndex, endChunkExclusive)
			.map((chunk, localIndex) => ({
				chunk,
				globalIndex: startChunkIndex + localIndex,
			}));
		const hasMoreChunks = endChunkExclusive < chunks.length;

		// Extract entities from each chunk and merge results
		const extractionService = new EntityExtractionService(llmApiKey);
		const allExtractedEntities: Map<string, ExtractedEntity> = new Map();

		const CHUNK_CONCURRENCY = 3;
		const CHUNK_START_INTERVAL_MS = 1000; // Min interval between chunk starts to respect provider TPM
		const MAX_CHUNK_RETRIES = 3; // Maximum retry attempts per chunk (rate limits only)
		const INITIAL_RETRY_DELAY_MS = 2000; // Initial delay for retries (2 seconds)
		const MAX_RETRY_DELAY_MS = 30000; // Maximum delay for retries (30 seconds)

		// Serialized throttle: at most one chunk starts per CHUNK_START_INTERVAL_MS
		let nextStartTime = 0;
		let throttleChain = Promise.resolve();
		const acquireChunkSlot = (): Promise<void> => {
			throttleChain = throttleChain.then(async () => {
				const now = Date.now();
				const wait = nextStartTime - now;
				if (wait > 0) await new Promise((r) => setTimeout(r, wait));
				nextStartTime = Date.now() + CHUNK_START_INTERVAL_MS;
			});
			return throttleChain;
		};

		const failedChunks: number[] = [];
		const chunkRetryCounts: Map<number, number> = new Map(); // Track retry count per chunk index
		const chunkContentByRetry: Map<number, string> = new Map(); // Trimmed content for context-length retries
		const chunksToRetry: number[] = []; // Chunks that need retrying
		let successfulChunks = 0;
		let completedCount = 0; // Monotonic count for onChunkCheckpoint (parallel completion)

		// Helper function to process a single chunk
		const processChunk = async (
			chunkIndex: number,
			chunk: string,
			isRetry: boolean = false
		): Promise<boolean> => {
			const chunkNumber = chunkIndex + 1;
			const retryCount = chunkRetryCounts.get(chunkIndex) || 0;

			await acquireChunkSlot();

			// Add exponential backoff delay for retries
			if (isRetry && retryCount > 0) {
				const backoffDelay = Math.min(
					INITIAL_RETRY_DELAY_MS * 2 ** (retryCount - 1),
					MAX_RETRY_DELAY_MS
				);
				await new Promise((resolve) => setTimeout(resolve, backoffDelay));
			}

			try {
				const rateLimitService = getLLMRateLimitService(env);
				const chunkEntities = await extractionService.extractEntities({
					content: chunk,
					sourceName: normalizedResource.file_name || normalizedResource.id,
					campaignId,
					sourceId: normalizedResource.id,
					sourceType: "file_upload",
					llmApiKey,
					username,
					onUsage: async (usage, ctx) => {
						await rateLimitService.recordUsage(
							username,
							usage.tokens,
							usage.queryCount,
							ctx?.model
						);
					},
					metadata: {
						fileKey: normalizedResource.file_key || normalizedResource.id,
						resourceId: normalizedResource.id,
						resourceName: normalizedResource.file_name || normalizedResource.id,
						staged: true,
						shardStatus: "staging",
						chunkIndex: chunkIndex,
						totalChunks: chunks.length,
					},
				});

				// Merge entities by ID (same entity ID = merge content/metadata)
				for (const entity of chunkEntities) {
					const existing = allExtractedEntities.get(entity.id);
					if (existing) {
						// Merge: combine content, merge relations, update metadata
						existing.content = {
							...(typeof existing.content === "object" &&
							existing.content !== null
								? existing.content
								: {}),
							...(typeof entity.content === "object" && entity.content !== null
								? entity.content
								: {}),
						};
						// Merge relations (avoid duplicates)
						const existingTargetIds = new Set(
							existing.relations.map((r) => r.targetId)
						);
						for (const rel of entity.relations) {
							if (!existingTargetIds.has(rel.targetId)) {
								existing.relations.push(rel);
								existingTargetIds.add(rel.targetId);
							}
						}
						// Update metadata
						existing.metadata = {
							...existing.metadata,
							...entity.metadata,
						};
					} else {
						allExtractedEntities.set(entity.id, entity);
					}
				}

				// Success - remove from retry tracking if it was a retry
				if (isRetry) {
					chunkRetryCounts.delete(chunkIndex);
				}
				completedCount++;
				await onChunkCheckpoint?.({
					processedChunks: completedCount,
					totalChunks: chunks.length,
				});
				return true;
			} catch (chunkError) {
				// Log error
				const errorMessage =
					chunkError instanceof Error ? chunkError.message : "Unknown error";
				const isRateLimit =
					errorMessage.includes("rate limit") ||
					errorMessage.includes("429") ||
					errorMessage.includes("Too Many Requests");
				const isAuthenticationError =
					errorMessage.includes("invalid x-api-key") ||
					errorMessage.includes("authentication_error") ||
					errorMessage.includes("invalid api key") ||
					errorMessage.includes("unauthorized") ||
					(errorMessage.includes("401") && errorMessage.includes("api"));
				const isNoOutput =
					errorMessage.includes("No output generated") ||
					errorMessage.includes("AI_NoOutputGeneratedError");

				// No output from model: treat as empty chunk (0 entities), don't retry
				if (isNoOutput) {
					completedCount++;
					await onChunkCheckpoint?.({
						processedChunks: completedCount,
						totalChunks: chunks.length,
					});
					return true;
				}

				// Authentication/configuration errors are unrecoverable for this run.
				// Fail immediately instead of retrying every chunk.
				if (isAuthenticationError) {
					throw new Error(
						`Authentication/configuration error during extraction for chunk ${chunkNumber}: ${errorMessage}`
					);
				}

				if (isRetry) {
				} else {
				}

				// Retry rate-limit errors with same payload; retry context-length errors with trimmed content.
				const isContextLength = isContextLengthError(chunkError);
				if (isRateLimit && retryCount < MAX_CHUNK_RETRIES) {
					// Increment retry count and schedule retry (same payload)
					chunkRetryCounts.set(chunkIndex, retryCount + 1);
					const rateLimitWaitMs = 5000; // Wait 5 seconds for rate limit
					await new Promise((resolve) => setTimeout(resolve, rateLimitWaitMs));

					return false; // Indicates failure but will be retried
				}
				if (isContextLength && retryCount < MAX_CHUNK_RETRIES) {
					// Trim content to ~60% for retry; each subsequent retry trims again
					// `chunk` is the content we just failed with (original or previously trimmed)
					const currentContent = chunk;
					const targetChars = Math.floor(currentContent.length * 0.6);
					const trimmedContent = truncateContentAtSentenceBoundary(
						currentContent,
						targetChars
					);
					if (trimmedContent.length >= 2000) {
						chunkContentByRetry.set(chunkIndex, trimmedContent);
						chunkRetryCounts.set(chunkIndex, retryCount + 1);
						return false; // Will be retried with trimmed content
					}
				}
				failedChunks.push(chunkNumber);
				completedCount++;
				await onChunkCheckpoint?.({
					processedChunks: completedCount,
					totalChunks: chunks.length,
				});
				// Keep retry count so caller won't re-queue (newRetryCount >= MAX_CHUNK_RETRIES)
				return false; // Permanently failed
			}
		};

		// Initial pass: process chunks with bounded concurrency
		const runWorkers = (
			items: Array<{ globalIndex: number; chunk: string }>,
			isRetryPhase: boolean
		) => {
			const numWorkers = Math.min(CHUNK_CONCURRENCY, items.length);
			let nextIndex = 0;
			const workers = Array.from({ length: numWorkers }, async () => {
				while (true) {
					const currentIndex = nextIndex++;
					if (currentIndex >= items.length) return;
					const { globalIndex, chunk } = items[currentIndex];
					const success = await processChunk(globalIndex, chunk, isRetryPhase);
					if (success) {
						successfulChunks++;
					} else {
						const retryCount = chunkRetryCounts.get(globalIndex) || 0;
						if (retryCount < MAX_CHUNK_RETRIES) {
							chunksToRetry.push(globalIndex);
						}
					}
				}
			});
			return Promise.all(workers);
		};

		if (chunksToProcess.length === 1) {
			// Single chunk: no concurrency benefit, process directly
			const { chunk, globalIndex } = chunksToProcess[0];
			const success = await processChunk(globalIndex, chunk, false);
			if (success) {
				successfulChunks++;
			} else {
				const retryCount = chunkRetryCounts.get(globalIndex) || 0;
				if (retryCount < MAX_CHUNK_RETRIES) {
					chunksToRetry.push(globalIndex);
				}
			}
		} else {
			await runWorkers(
				chunksToProcess.map((c) => ({
					globalIndex: c.globalIndex,
					chunk: c.chunk,
				})),
				false
			);
		}

		// Retry failed chunks with bounded concurrency (batch approach)
		while (chunksToRetry.length > 0) {
			const currentRetries = [...chunksToRetry];
			chunksToRetry.length = 0;
			const retryItems = currentRetries.map((chunkIndex) => ({
				globalIndex: chunkIndex,
				chunk: chunkContentByRetry.get(chunkIndex) ?? chunks[chunkIndex],
			}));
			await runWorkers(retryItems, true);
		}

		// Log summary of chunk processing
		if (failedChunks.length > 0) {
		}

		const extractedEntities = Array.from(allExtractedEntities.values());

		if (extractedEntities.length === 0) {
			if (hasMoreChunks) {
				return {
					success: true,
					entityCount: 0,
					stagedEntities: [],
					completed: false,
					nextChunkIndex: endChunkExclusive,
					totalChunks: chunks.length,
				};
			}
			const notificationDetail =
				failedChunks.length > 0
					? "Some parts of the file could not be processed. You can retry to process the remaining content."
					: undefined;
			await notifyZeroEntitiesFound(
				env,
				campaignId,
				campaignName,
				normalizedResource.id,
				normalizedResource.file_name || normalizedResource.id,
				notificationDetail
			);
			return {
				success: true,
				entityCount: 0,
				stagedEntities: [],
				...(failedChunks.length > 0 && {
					failedChunks,
					successfulChunks,
					totalChunks: chunks.length,
				}),
			};
		}

		// Store entities with staging status in metadata
		const daoFactory = getDAOFactory(env);
		const stagedEntities: EntityStagingResult["stagedEntities"] = [];
		let _skippedCount = 0;
		let _updatedCount = 0;
		let _createdCount = 0;
		let _duplicateCount = 0;

		type RelationPayload = {
			fromEntityId: string;
			toEntityId: string;
			relationshipType: string;
			strength: number | null;
			metadata: Record<string, unknown>;
		};
		const relationPayloads: RelationPayload[] = [];
		const resolvedEntityIdByExtractedId = new Map<string, string>();
		const inRunCandidates: Array<{
			entityId: string;
			entityType: string;
			embedding: number[];
		}> = [];
		const embeddingCache = new Map<string, number[] | null>();
		const embeddingProvider = new ProviderEmbeddingService({
			openaiApiKey,
			aiBinding: (env as any).AI,
		});

		const getCachedEmbedding = async (
			text: string
		): Promise<number[] | null> => {
			const key = text.trim();
			if (!key) return null;
			if (embeddingCache.has(key)) {
				return embeddingCache.get(key) ?? null;
			}
			try {
				const embedding = await embeddingProvider.generateEmbedding(key);
				embeddingCache.set(key, embedding);
				return embedding;
			} catch {
				embeddingCache.set(key, null);
				return null;
			}
		};

		const registerInRunCandidate = (
			entityId: string,
			entityType: string,
			embedding: number[] | null
		) => {
			if (!embedding || embedding.length === 0) return;
			const existingCandidate = inRunCandidates.find(
				(c) => c.entityId === entityId
			);
			if (existingCandidate) {
				existingCandidate.embedding = embedding;
				existingCandidate.entityType = entityType;
				return;
			}
			inRunCandidates.push({ entityId, entityType, embedding });
		};

		/** Deep equality for content; used to skip approved entities when no new information. */
		function contentUnchanged(
			existingContent: unknown,
			mergedContent: unknown
		): boolean {
			const normalized = (v: unknown): string => {
				if (v === null || v === undefined) return JSON.stringify(v);
				if (typeof v !== "object") return JSON.stringify(v);
				if (Array.isArray(v)) return JSON.stringify(v.map(normalized));
				const o = v as Record<string, unknown>;
				const keys = Object.keys(o).sort();
				return JSON.stringify(keys.map((k) => [k, normalized(o[k])]));
			};
			return normalized(existingContent) === normalized(mergedContent);
		}

		/** Keys that change every staging run; exclude when comparing metadata for "unchanged". */
		const META_RUN_KEYS = new Set([
			"resourceId",
			"resourceName",
			"fileKey",
			"pendingRelations",
			"stagedFrom",
			"stagedAt",
		]);
		function metaUnchanged(
			existingMeta: Record<string, unknown>,
			mergedMeta: Record<string, unknown>
		): boolean {
			const strip = (m: Record<string, unknown>): Record<string, unknown> => {
				const o: Record<string, unknown> = {};
				for (const k of Object.keys(m)) {
					if (!META_RUN_KEYS.has(k)) o[k] = m[k];
				}
				return o;
			};
			return contentUnchanged(strip(existingMeta), strip(mergedMeta));
		}

		// Update relationships to use campaign-scoped IDs
		for (const extracted of extractedEntities) {
			extracted.relations = extracted.relations.map((rel) => {
				let targetId = rel.targetId;
				if (!targetId.startsWith(`${campaignId}_`)) {
					targetId = `${campaignId}_${targetId}`;
				}
				return { ...rel, targetId };
			});
		}

		// Pass 1: create or update all entities only; collect relationship payloads
		for (const extracted of extractedEntities) {
			const entityId = extracted.id;
			const updatedRelations = extracted.relations;
			const entityType = normalizeEntityType(extracted.entityType ?? "");
			const normalizedName = (extracted.name ?? "").trim();
			const contentForSemantic = buildSemanticCandidateText(
				normalizedName,
				extracted.content
			);
			const currentEmbedding = await getCachedEmbedding(contentForSemantic);

			const entityMetadata: Record<string, unknown> = {
				...extracted.metadata,
				shardStatus: "staging" as const,
				staged: true,
				resourceId: normalizedResource.id,
				resourceName: normalizedResource.file_name || normalizedResource.id,
				fileKey: normalizedResource.file_key || normalizedResource.id,
				pendingRelations: updatedRelations.map((rel) => ({
					relationshipType: rel.relationshipType,
					targetId: rel.targetId,
					strength: rel.strength,
					metadata: rel.metadata,
				})),
				...(attribution && {
					proposedBy: attribution.proposedBy,
					approvedBy: attribution.approvedBy,
				}),
			};

			const existing = await daoFactory.entityDAO.getEntityById(entityId);

			if (existing) {
				resolvedEntityIdByExtractedId.set(entityId, existing.id);
				const existingMetadata =
					(existing.metadata as Record<string, unknown>) || {};
				const mergedContent = mergeEntityContent(
					existing.content,
					extracted.content
				);
				const mergedMetaBase = {
					...existingMetadata,
					...entityMetadata,
					isStub: !!isStubContent(mergedContent, entityType),
				};
				const mergedMeta =
					existingMetadata.shardStatus === "approved"
						? { ...mergedMetaBase, shardStatus: "approved" as const }
						: { ...mergedMetaBase, shardStatus: "staging" as const };
				if (existingMetadata.shardStatus === "approved") {
					if (
						contentUnchanged(existing.content, mergedContent) &&
						metaUnchanged(existingMetadata, mergedMeta)
					) {
						_skippedCount++;
						continue;
					}
				}
				await daoFactory.entityDAO.updateEntity(entityId, {
					name: normalizedName,
					content: mergedContent,
					metadata: mergedMeta,
					shardStatus:
						existingMetadata.shardStatus === "approved"
							? "approved"
							: "staging",
					confidence: (extracted.metadata.confidence as number) ?? null,
					sourceType: "file_upload",
					sourceId: normalizedResource.id,
				});
				_updatedCount++;
				for (const rel of updatedRelations) {
					relationPayloads.push({
						fromEntityId: entityId,
						toEntityId: rel.targetId,
						relationshipType: rel.relationshipType,
						strength: rel.strength ?? null,
						metadata: {
							...(rel.metadata as Record<string, unknown>),
							status: "staging",
						},
					});
				}
				stagedEntities.push({
					id: entityId,
					entityType,
					name: normalizedName,
					content: mergedContent,
					metadata: mergedMeta,
					relations: updatedRelations.map((rel) => ({
						relationshipType: rel.relationshipType,
						targetId: rel.targetId,
						strength: rel.strength,
						metadata: rel.metadata,
					})),
				});
				registerInRunCandidate(existing.id, entityType, currentEmbedding);
				continue;
			}

			let duplicateEntity: Awaited<
				ReturnType<typeof daoFactory.entityDAO.getEntityById>
			> = null;

			if (currentEmbedding) {
				let bestInRun: { entityId: string; score: number } | null = null;
				for (const candidate of inRunCandidates) {
					if (candidate.entityType !== entityType) continue;
					const score = cosineSimilarity(currentEmbedding, candidate.embedding);
					if (score >= IN_RUN_SEMANTIC_DUPLICATE_THRESHOLD) {
						if (!bestInRun || score > bestInRun.score) {
							bestInRun = { entityId: candidate.entityId, score };
						}
					}
				}
				if (bestInRun) {
					duplicateEntity = await daoFactory.entityDAO.getEntityById(
						bestInRun.entityId
					);
					if (duplicateEntity) {
					}
				}
			}

			if (!duplicateEntity) {
				duplicateEntity =
					await SemanticDuplicateDetectionService.findDuplicateEntity({
						content: contentForSemantic,
						campaignId,
						name: normalizedName,
						entityType,
						excludeEntityId: entityId,
						env,
						openaiApiKey,
					});
			}

			if (duplicateEntity) {
				resolvedEntityIdByExtractedId.set(entityId, duplicateEntity.id);
				const existingMetadata =
					(duplicateEntity.metadata as Record<string, unknown>) || {};
				const mergedContent = mergeEntityContent(
					duplicateEntity.content,
					extracted.content
				);
				const sufficient = !isStubContent(mergedContent, entityType);
				const mergedMetaBase = {
					...existingMetadata,
					...entityMetadata,
					isStub: sufficient ? false : (existingMetadata.isStub ?? true),
				};
				const mergedMeta =
					existingMetadata.shardStatus === "approved"
						? { ...mergedMetaBase, shardStatus: "approved" as const }
						: { ...mergedMetaBase, shardStatus: "staging" as const };
				if (existingMetadata.shardStatus === "approved") {
					if (
						contentUnchanged(duplicateEntity.content, mergedContent) &&
						metaUnchanged(existingMetadata, mergedMeta)
					) {
						_duplicateCount++;
						continue;
					}
				}
				await daoFactory.entityDAO.updateEntity(duplicateEntity.id, {
					name: normalizedName,
					content: mergedContent,
					metadata: mergedMeta,
					shardStatus:
						existingMetadata.shardStatus === "approved"
							? "approved"
							: "staging",
					confidence: (extracted.metadata.confidence as number) ?? null,
					sourceType: "file_upload",
					sourceId: normalizedResource.id,
				});
				_updatedCount++;
				for (const rel of updatedRelations) {
					relationPayloads.push({
						fromEntityId: duplicateEntity.id,
						toEntityId: rel.targetId,
						relationshipType: rel.relationshipType,
						strength: rel.strength ?? null,
						metadata: {
							...(rel.metadata as Record<string, unknown>),
							status: "staging",
						},
					});
				}
				stagedEntities.push({
					id: duplicateEntity.id,
					entityType,
					name: normalizedName,
					content: mergedContent,
					metadata: mergedMeta,
					relations: updatedRelations.map((rel) => ({
						relationshipType: rel.relationshipType,
						targetId: rel.targetId,
						strength: rel.strength,
						metadata: rel.metadata,
					})),
				});
				registerInRunCandidate(
					duplicateEntity.id,
					entityType,
					currentEmbedding
				);
				continue;
			}

			const isStub = isStubContent(extracted.content, entityType);
			const newMeta = { ...entityMetadata, isStub };
			await daoFactory.entityDAO.createEntity({
				id: entityId,
				campaignId,
				entityType,
				name: normalizedName,
				content: extracted.content,
				shardStatus: "staging",
				metadata: newMeta,
				confidence: (extracted.metadata.confidence as number) ?? null,
				sourceType: "file_upload",
				sourceId: normalizedResource.id,
			});
			_createdCount++;
			resolvedEntityIdByExtractedId.set(entityId, entityId);
			for (const rel of updatedRelations) {
				relationPayloads.push({
					fromEntityId: entityId,
					toEntityId: rel.targetId,
					relationshipType: rel.relationshipType,
					strength: rel.strength ?? null,
					metadata: {
						...(rel.metadata as Record<string, unknown>),
						status: "staging",
					},
				});
			}
			stagedEntities.push({
				id: entityId,
				entityType,
				name: extracted.name,
				content: extracted.content,
				metadata: newMeta,
				relations: updatedRelations.map((rel) => ({
					relationshipType: rel.relationshipType,
					targetId: rel.targetId,
					strength: rel.strength,
					metadata: rel.metadata,
				})),
			});
			registerInRunCandidate(entityId, entityType, currentEmbedding);
		}

		// Pass 2: create all relationships (all entities now exist)
		const graphService = new EntityGraphService(daoFactory.entityDAO);
		const dedupedRelationPayloads = new Map<string, RelationPayload>();
		for (const rel of relationPayloads) {
			const resolvedFrom =
				resolvedEntityIdByExtractedId.get(rel.fromEntityId) || rel.fromEntityId;
			const resolvedTo =
				resolvedEntityIdByExtractedId.get(rel.toEntityId) || rel.toEntityId;
			if (resolvedFrom === resolvedTo) continue;
			const relationKey = `${resolvedFrom}:${resolvedTo}:${rel.relationshipType}`;
			if (dedupedRelationPayloads.has(relationKey)) continue;
			dedupedRelationPayloads.set(relationKey, {
				...rel,
				fromEntityId: resolvedFrom,
				toEntityId: resolvedTo,
			});
		}
		for (const rel of dedupedRelationPayloads.values()) {
			try {
				await graphService.upsertEdge({
					campaignId,
					fromEntityId: rel.fromEntityId,
					toEntityId: rel.toEntityId,
					relationshipType: rel.relationshipType,
					strength: rel.strength,
					metadata: rel.metadata,
					allowSelfRelation: false,
				});
			} catch (_error) {}
		}

		// Calculate importance for all entities in batch (including newly staged entities)
		// This is much more efficient than calculating per-entity, as it runs PageRank
		// and Betweenness Centrality once for the entire graph instead of N times
		if (stagedEntities.length > 0 && !hasMoreChunks) {
			try {
				const importanceService = new EntityImportanceService(
					daoFactory.entityDAO,
					daoFactory.communityDAO,
					daoFactory.entityImportanceDAO
				);

				// Batch calculate importance for all entities in the campaign
				// This calculates PageRank and Betweenness Centrality once, then
				// calculates hierarchy level for each entity
				await importanceService.recalculateImportanceForCampaign(campaignId);
			} catch (_error) {
				// Continue even if importance calculation fails - entities are still staged
			}
		}

		// Notify all campaign members only when all chunks are complete.
		if (!hasMoreChunks) {
			try {
				let notificationMessage = "";
				if (failedChunks.length > 0 && stagedEntities.length > 0) {
					const successRate = Math.round(
						(successfulChunks / chunks.length) * 100
					);
					notificationMessage = ` ⚠️ We extracted ${stagedEntities.length} shards, but couldn't process some parts of the file (${successRate}% processed successfully). This usually happens when processing very large files. You can retry to process the remaining content.`;
				} else if (failedChunks.length > 0 && stagedEntities.length === 0) {
					notificationMessage = ` ❌ We couldn't extract any shards from this file. This may be due to the file being too large or temporary processing issues. Please try again later.`;
				}

				const totalProcessed = stagedEntities.length;
				const newForApproval = stagedEntities.filter(
					(e) =>
						(e.metadata as Record<string, unknown>)?.shardStatus === "staging"
				).length;
				const shardCount = newForApproval; // UI expects shardCount = pending for approval
				const fileName = normalizedResource.file_name || normalizedResource.id;
				let title: string;
				let message: string;
				if (!totalProcessed || totalProcessed === 0) {
					title = "No shards found";
					message = `🔎 No shards were discovered from "${fileName}" in "${campaignName}".${notificationMessage}`;
				} else if (totalProcessed === newForApproval) {
					title = "New shards ready";
					message = `🎉 ${newForApproval} new shard${newForApproval === 1 ? "" : "s"} generated from "${fileName}" in "${campaignName}"!${notificationMessage}`;
				} else {
					title = "New shards ready";
					message = `🎉 ${totalProcessed} entities processed; ${newForApproval} new shard${newForApproval === 1 ? "" : "s"} ready for approval from "${fileName}" in "${campaignName}".${notificationMessage}`;
				}

				await notifyCampaignMembers(
					env,
					campaignId,
					campaignName,
					() => ({
						type: NOTIFICATION_TYPES.SHARDS_GENERATED,
						title,
						message,
						data: {
							campaignName,
							fileName,
							shardCount,
							campaignId,
							resourceId: normalizedResource.id,
							ui_hint: {
								type: "shards_ready",
								data: {
									campaignId,
									resourceId: normalizedResource.id,
									groups: undefined,
								},
							},
						},
					}),
					[]
				);
			} catch (_notifyError) {}
		}

		// Return success if we got any entities, even if some chunks failed
		return {
			success: stagedEntities.length > 0 || failedChunks.length === 0,
			entityCount: stagedEntities.length,
			stagedEntities,
			completed: !hasMoreChunks,
			nextChunkIndex: hasMoreChunks ? endChunkExclusive : undefined,
			totalChunks: chunks.length,
			...(failedChunks.length > 0
				? {
						warning: `Some chunks failed to process: ${failedChunks.join(", ")}`,
						failedChunks,
						successfulChunks,
					}
				: {}),
		};
	} catch (error) {
		return {
			success: false,
			entityCount: 0,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}
