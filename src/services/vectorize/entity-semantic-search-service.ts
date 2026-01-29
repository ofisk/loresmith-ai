import type { VectorizeIndex } from "@cloudflare/workers-types";
import { EntityEmbeddingService } from "./entity-embedding-service";

export interface EntitySemanticSearchMatch {
  entityId: string;
  score: number;
}

export interface EntitySemanticSearchOptions {
  topK?: number;
  minScore?: number;
  entityType?: string;
}

const DEFAULT_TOP_K = 15;
const DEFAULT_MIN_SCORE = 0.3;

/**
 * Shared semantic search for entities by free-text query.
 * Encapsulates: query → embedding (via provided fn) → vector similarity → filter by score.
 * Callers supply the embedding function so they can use user-scoped keys (e.g. userAuth.openaiApiKey)
 * or env keys (e.g. PlanningContextService).
 */
export class EntitySemanticSearchService {
  constructor(
    private readonly vectorize: VectorizeIndex | undefined,
    private readonly getQueryEmbedding: (query: string) => Promise<number[]>
  ) {}

  /**
   * Search for entities in a campaign by semantic similarity to the query.
   * Returns matches above minScore, or [] if VECTORIZE is unavailable or embedding fails.
   */
  async searchEntities(
    campaignId: string,
    query: string,
    options: EntitySemanticSearchOptions = {}
  ): Promise<EntitySemanticSearchMatch[]> {
    if (!this.vectorize || !query.trim()) {
      return [];
    }

    try {
      const embedding = await this.getQueryEmbedding(query.trim());
      const embeddingService = new EntityEmbeddingService(this.vectorize);
      const topK = options.topK ?? DEFAULT_TOP_K;
      const minScore = options.minScore ?? DEFAULT_MIN_SCORE;

      const similar = await embeddingService.findSimilarByEmbedding(embedding, {
        campaignId,
        entityType: options.entityType,
        topK,
      });

      return similar
        .filter((s) => s.score >= minScore)
        .map((s) => ({ entityId: s.entityId, score: s.score }));
    } catch {
      return [];
    }
  }
}
