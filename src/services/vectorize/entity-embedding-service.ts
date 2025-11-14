import type { VectorizeIndex } from "@cloudflare/workers-types";
import { VectorizeIndexRequiredError } from "@/lib/errors";

export interface UpsertEntityEmbeddingOptions {
  entityId: string;
  campaignId: string;
  entityType: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

export interface SimilarEntityResult {
  entityId: string;
  score: number;
  campaignId?: string;
  entityType?: string;
  metadata?: unknown;
}

export class EntityEmbeddingService {
  constructor(private readonly vectorize: VectorizeIndex | undefined) {}

  private ensureIndex(): VectorizeIndex {
    if (!this.vectorize) {
      throw new VectorizeIndexRequiredError();
    }
    return this.vectorize;
  }

  async upsertEmbedding(options: UpsertEntityEmbeddingOptions): Promise<void> {
    const index = this.ensureIndex();

    await index.upsert([
      {
        id: options.entityId,
        values: options.embedding,
        metadata: {
          campaignId: options.campaignId,
          entityType: options.entityType,
          ...(options.metadata ?? {}),
        },
      },
    ]);
  }

  async deleteEmbedding(entityId: string): Promise<void> {
    const index = this.ensureIndex();
    await index.deleteByIds([entityId]);
  }

  async findSimilarByEmbedding(
    embedding: number[],
    {
      campaignId,
      entityType,
      topK = 10,
      excludeEntityIds = [],
    }: {
      campaignId?: string;
      entityType?: string;
      topK?: number;
      excludeEntityIds?: string[];
    } = {}
  ): Promise<SimilarEntityResult[]> {
    const index = this.ensureIndex();

    const response = await index.query(embedding, {
      topK,
      returnMetadata: true,
    });

    return (response.matches ?? [])
      .filter((match) => match.id && !excludeEntityIds.includes(match.id))
      .map((match) => {
        const matchId = match.id as string;
        const matchCampaignId = this.getStringMetadata(
          match.metadata,
          "campaignId"
        );
        const matchEntityType = this.getStringMetadata(
          match.metadata,
          "entityType"
        );

        return {
          entityId: matchId,
          score: match.score,
          campaignId: matchCampaignId ?? undefined,
          entityType: matchEntityType ?? undefined,
          metadata: match.metadata,
        };
      })
      .filter((match) => {
        const campaignMatches = !campaignId || match.campaignId === campaignId;
        const typeMatches = !entityType || match.entityType === entityType;
        return campaignMatches && typeMatches;
      });
  }

  async findSimilarByEntityId(
    entityId: string,
    options: {
      campaignId?: string;
      entityType?: string;
      topK?: number;
      excludeEntityIds?: string[];
    } = {}
  ): Promise<SimilarEntityResult[]> {
    const index = this.ensureIndex();

    const storedVectors = await index.getByIds([entityId]);
    const embedding = storedVectors?.[0]?.values;

    if (!embedding || !Array.isArray(embedding)) {
      return [];
    }

    return this.findSimilarByEmbedding(Array.from(embedding), {
      ...options,
      excludeEntityIds: [entityId, ...(options.excludeEntityIds ?? [])],
    });
  }

  private getStringMetadata(
    metadata: Record<string, unknown> | undefined,
    key: string
  ): string | null {
    if (!metadata) {
      return null;
    }

    const value = metadata[key];
    return typeof value === "string" ? value : null;
  }
}
