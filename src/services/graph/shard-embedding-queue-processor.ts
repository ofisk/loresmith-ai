import { getDAOFactory } from "@/dao/dao-factory";
import { getEnvVar } from "@/lib/env-utils";
import type { Env } from "@/middleware/auth";
import { OpenAIEmbeddingService } from "@/services/embedding/openai-embedding-service";
import { getLLMRateLimitService } from "@/services/llm/llm-rate-limit-service";
import { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";
import type { ShardEmbeddingQueueMessage } from "@/types/shard-embedding-queue";

const EMBEDDING_BATCH_SIZE = 25;

export class ShardEmbeddingQueueProcessor {
	constructor(private env: Env) {}

	async handleMessage(message: ShardEmbeddingQueueMessage): Promise<void> {
		const { entityIds, campaignId, username } = message;

		if (!entityIds.length) {
			return;
		}

		const daoFactory = getDAOFactory(this.env);
		const entityDAO = daoFactory.entityDAO;
		const vectorize = this.env.VECTORIZE;
		const openaiApiKeyRaw = await getEnvVar(this.env, "OPENAI_API_KEY", false);
		const openaiApiKey = openaiApiKeyRaw?.trim() || undefined;

		if (!vectorize) {
			console.warn(
				"[ShardEmbeddingQueue] VECTORIZE not configured, skipping embedding"
			);
			return;
		}

		if (!openaiApiKey) {
			console.warn(
				"[ShardEmbeddingQueue] OPENAI_API_KEY not configured, skipping embedding"
			);
			return;
		}

		const embeddingService = new EntityEmbeddingService(vectorize);
		const openaiEmbeddingService = new OpenAIEmbeddingService(openaiApiKey);
		const rateLimitService = getLLMRateLimitService(this.env);

		const entities = await entityDAO.getEntitiesByIds(entityIds);
		const campaignEntities = entities.filter(
			(e) => e.campaignId === campaignId
		);

		if (campaignEntities.length === 0) {
			return;
		}

		const existingVectors =
			(await vectorize.getByIds(campaignEntities.map((e) => e.id))) ?? [];
		const hasEmbeddingById = new Set(
			existingVectors
				.filter((v) => v?.values?.length)
				.map((v) => v.id as string)
		);

		const toEmbed = campaignEntities.filter((e) => !hasEmbeddingById.has(e.id));

		if (toEmbed.length > 0) {
			for (let i = 0; i < toEmbed.length; i += EMBEDDING_BATCH_SIZE) {
				const chunk = toEmbed.slice(i, i + EMBEDDING_BATCH_SIZE);
				const texts = chunk.map((entity) => {
					const contentText =
						typeof entity.content === "string"
							? entity.content
							: JSON.stringify(entity.content || {});
					return contentText;
				});

				const embeddings = await openaiEmbeddingService.generateEmbeddings(
					texts,
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

				await embeddingService.upsertEmbeddings(
					chunk.map((entity, idx) => ({
						entityId: entity.id,
						campaignId: entity.campaignId,
						entityType: entity.entityType,
						embedding: embeddings[idx],
						metadata: (entity.metadata as Record<string, unknown>) || {},
					}))
				);

				console.log(
					`[ShardEmbeddingQueue] Indexed embeddings for ${chunk.length} entities (batch ${Math.floor(i / EMBEDDING_BATCH_SIZE) + 1})`
				);
			}
		}

		const toUpdateMetadata = campaignEntities.filter((e) =>
			hasEmbeddingById.has(e.id)
		);
		if (toUpdateMetadata.length > 0) {
			const vectors = await vectorize.getByIds(
				toUpdateMetadata.map((e) => e.id)
			);
			const vectorById = new Map<string, { values: number[] }>();
			if (vectors) {
				for (const v of vectors) {
					if (v?.id && v?.values?.length) {
						vectorById.set(v.id as string, {
							values: Array.from(v.values),
						});
					}
				}
			}
			const toUpsert = toUpdateMetadata
				.map((entity) => {
					const vec = vectorById.get(entity.id);
					if (!vec) return null;
					return {
						entityId: entity.id,
						campaignId: entity.campaignId,
						entityType: entity.entityType,
						embedding: vec.values,
						metadata: (entity.metadata as Record<string, unknown>) || {},
					};
				})
				.filter((x): x is NonNullable<typeof x> => x !== null);
			if (toUpsert.length > 0) {
				await embeddingService.upsertEmbeddings(toUpsert);
				console.log(
					`[ShardEmbeddingQueue] Updated metadata for ${toUpsert.length} existing embeddings`
				);
			}
		}
	}
}
