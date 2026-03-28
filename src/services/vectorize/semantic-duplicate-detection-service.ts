import { getDAOFactory } from "@/dao/dao-factory";
import type { Entity } from "@/dao/entity-dao";
import type { Env } from "@/middleware/auth";
import { ProviderEmbeddingService } from "@/services/embedding/provider-embedding-service";
import { EntityEmbeddingService } from "./entity-embedding-service";

export interface SemanticDuplicateDetectionOptions {
	/** The text content to check for duplicates */
	content: string;
	/** Campaign ID to scope the search */
	campaignId: string;
	/** Entity type to filter results (optional) */
	entityType?: string;
	/** Entity ID to exclude from search (e.g., the current entity being checked) */
	excludeEntityId?: string;
	/** Number of similar entities to check (default: 5) */
	topK?: number;
	/** Similarity threshold for high-confidence duplicates (default: 0.9) */
	threshold?: number;
	/** Environment object for database access */
	env: Env;
	/** Embedding API key (OpenAI). Optional if Cloudflare AI binding is available. */
	openaiApiKey?: string;
	/** Context for logging (e.g., entity name, shard title) */
	context?: {
		name?: string;
		id?: string;
		type?: string;
	};
}

export interface SemanticDuplicateDetectionResult {
	/** Whether a duplicate was found */
	isDuplicate: boolean;
	/** The duplicate entity if found */
	duplicateEntity?: {
		id: string;
		name: string;
		score: number;
	};
}

/** Options for finding a duplicate entity (semantic first, lexical fallback) */
export interface FindDuplicateEntityOptions {
	/** Text to embed for semantic search (e.g. entity name + content) */
	content: string;
	/** Campaign ID to scope the search */
	campaignId: string;
	/** Entity name for lexical fallback (exact/trimmed name match) */
	name: string;
	/** Entity type to filter results (optional) */
	entityType?: string;
	/** Entity ID to exclude (e.g. current entity being updated) */
	excludeEntityId?: string;
	/** Similarity threshold for semantic match (default: 0.85) */
	threshold?: number;
	/** Number of similar entities to check (default: 10) */
	topK?: number;
	env: Env;
	/** Embedding API key (OpenAI); if missing, can fall back to Cloudflare AI binding. */
	openaiApiKey?: string;
}

/**
 * Service for detecting semantic duplicates using embeddings.
 *
 * Duplicate layers in the product: (1) this path merges **entity** rows when name+content
 * are near-duplicates (Vectorize + lexical fallback); (2) R2 shard files and shard_registry
 * are separate—repeated uploads or chunk jobs may still create duplicate entities if the LLM
 * names the same fiction differently across chunks; merge policy and threshold tuning live here.
 */
export class SemanticDuplicateDetectionService {
	/**
	 * Find an existing entity that is a duplicate of the given content.
	 * Uses semantic search first (embedding similarity); falls back to lexical name match
	 * when VECTORIZE/OpenAI is unavailable or no semantic match is above threshold.
	 */
	static async findDuplicateEntity(
		options: FindDuplicateEntityOptions
	): Promise<Entity | null> {
		const {
			content,
			campaignId,
			name,
			entityType,
			excludeEntityId,
			threshold = 0.85,
			topK = 10,
			env,
			openaiApiKey,
		} = options;

		const daoFactory = getDAOFactory(env);
		const normalizedName = (name ?? "").trim();

		if (env.VECTORIZE && content.trim()) {
			try {
				const embeddingService = new EntityEmbeddingService(env.VECTORIZE);
				const providerEmbeddingService = new ProviderEmbeddingService({
					openaiApiKey,
					aiBinding: (env as any).AI,
				});
				const contentEmbedding =
					await providerEmbeddingService.generateEmbedding(content.trim());
				const similarEntities = await embeddingService.findSimilarByEmbedding(
					contentEmbedding,
					{
						campaignId,
						entityType,
						topK,
						excludeEntityIds: excludeEntityId ? [excludeEntityId] : [],
					}
				);
				for (const similar of similarEntities) {
					if (similar.score >= threshold) {
						const entity = await daoFactory.entityDAO.getEntityById(
							similar.entityId
						);
						if (entity) {
							return entity;
						}
					}
				}
			} catch (_error) {}
		}

		return daoFactory.entityDAO.findDuplicateByName(
			campaignId,
			normalizedName,
			entityType,
			excludeEntityId
		);
	}

	/**
	 * Check if content is a semantic duplicate of existing entities
	 */
	static async checkForDuplicate(
		options: SemanticDuplicateDetectionOptions
	): Promise<SemanticDuplicateDetectionResult> {
		const {
			content,
			campaignId,
			entityType,
			excludeEntityId,
			topK = 5,
			threshold = 0.9,
			env,
			openaiApiKey,
		} = options;

		try {
			const embeddingService = new EntityEmbeddingService(env.VECTORIZE);
			const providerEmbeddingService = new ProviderEmbeddingService({
				openaiApiKey,
				aiBinding: (env as any).AI,
			});

			// Generate embedding for the content
			const contentEmbedding =
				await providerEmbeddingService.generateEmbedding(content);

			// Find similar entities using semantic search
			const similarEntities = await embeddingService.findSimilarByEmbedding(
				contentEmbedding,
				{
					campaignId,
					entityType,
					topK,
					excludeEntityIds: excludeEntityId ? [excludeEntityId] : [],
				}
			);

			// Check if any similar entity is a high-confidence match
			const daoFactory = getDAOFactory(env);
			for (const similar of similarEntities) {
				if (similar.score >= threshold) {
					const duplicateEntity = await daoFactory.entityDAO.getEntityById(
						similar.entityId
					);
					if (duplicateEntity) {
						return {
							isDuplicate: true,
							duplicateEntity: {
								id: similar.entityId,
								name: duplicateEntity.name,
								score: similar.score,
							},
						};
					}
				}
			}

			return { isDuplicate: false };
		} catch (_error) {
			// If duplicate detection fails, return false (don't block creation)
			return { isDuplicate: false };
		}
	}
}
