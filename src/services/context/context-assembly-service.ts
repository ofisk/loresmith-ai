import type { D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import { getDAOFactory } from "@/dao/dao-factory";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";
import { WorldStateChangelogService } from "@/services/graph/world-state-changelog-service";
import { PlanningContextService } from "@/services/rag/planning-context-service";
import type {
  ContextAssembly,
  ContextAssemblyOptions,
  WorldKnowledgeResult,
  WorldKnowledgeWithOverlay,
  EntityWithRelationships,
  EntityWithRelationshipsAndOverlay,
} from "@/types/context-assembly";

interface CacheEntry {
  data: ContextAssembly;
  expiresAt: number;
}

export class ContextAssemblyService {
  private entityGraphService: EntityGraphService;
  private entityEmbeddingService: EntityEmbeddingService;
  private worldStateChangelogService: WorldStateChangelogService;
  private planningContextService: PlanningContextService;

  // In-memory cache with TTL (5 minutes default)
  private static cache = new Map<string, CacheEntry>();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes in milliseconds

  constructor(
    db: D1Database,
    vectorize: VectorizeIndex,
    openaiApiKey: string,
    private env: any
  ) {
    const daoFactory = getDAOFactory(env);
    this.entityGraphService = new EntityGraphService(daoFactory.entityDAO);
    this.entityEmbeddingService = new EntityEmbeddingService(vectorize);
    this.worldStateChangelogService = new WorldStateChangelogService({
      db,
    });
    this.planningContextService = new PlanningContextService(
      db,
      vectorize,
      openaiApiKey,
      env
    );
  }

  /**
   * Generate cache key from query and options
   */
  private generateCacheKey(
    query: string,
    campaignId: string,
    options: ContextAssemblyOptions
  ): string {
    // Create a stable hash from query and options
    const optionsStr = JSON.stringify({
      maxEntities: options.maxEntities,
      maxNeighborsPerEntity: options.maxNeighborsPerEntity,
      maxPlanningContextResults: options.maxPlanningContextResults,
      applyRecencyWeighting: options.applyRecencyWeighting,
      fromDate: options.fromDate,
      toDate: options.toDate,
      sectionTypes: options.sectionTypes?.sort(),
    });

    // Simple hash function for cache key
    const queryHash = this.simpleHash(query.toLowerCase().trim());
    const optionsHash = this.simpleHash(optionsStr);

    return `context-assembly:${campaignId}:${queryHash}:${optionsHash}`;
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Clean up expired cache entries
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of ContextAssemblyService.cache.entries()) {
      if (entry.expiresAt < now) {
        ContextAssemblyService.cache.delete(key);
      }
    }
  }

  /**
   * Invalidate cache for a campaign
   */
  static invalidateCampaignCache(campaignId: string): void {
    const keysToDelete: string[] = [];
    for (const key of ContextAssemblyService.cache.keys()) {
      if (key.startsWith(`context-assembly:${campaignId}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      ContextAssemblyService.cache.delete(key);
    }
  }

  /**
   * Assemble complete context combining GraphRAG world knowledge, changelog overlays, and planning context
   */
  async assembleContext(
    query: string,
    campaignId: string,
    options: ContextAssemblyOptions = {}
  ): Promise<ContextAssembly> {
    // Clean expired entries periodically (every 10 calls)
    if (Math.random() < 0.1) {
      this.cleanExpiredCache();
    }

    // Check cache first
    const cacheKey = this.generateCacheKey(query, campaignId, options);
    const cached = ContextAssemblyService.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.data,
        metadata: {
          ...cached.data.metadata,
          cached: true,
        },
      };
    }

    const startTime = Date.now();

    const {
      maxEntities = 10,
      maxNeighborsPerEntity = 5,
      maxPlanningContextResults = 5,
      applyRecencyWeighting = true,
      fromDate,
      toDate,
      sectionTypes,
    } = options;

    // Parallelize GraphRAG query and planning context retrieval (they're independent)
    const [graphRAGStart, planningStart] = [Date.now(), Date.now()];

    const [worldKnowledgeResult, planningContextResults] = await Promise.all([
      this.queryGraphRAG(query, campaignId, {
        maxEntities,
        maxNeighborsPerEntity,
      }),
      this.planningContextService.search({
        campaignId,
        query,
        limit: maxPlanningContextResults,
        applyRecencyWeighting,
        fromDate,
        toDate,
        sectionTypes,
      }),
    ]);

    const graphRAGQueryTime = Date.now() - graphRAGStart;
    const planningContextTime = Date.now() - planningStart;

    // Apply changelog overlays to world knowledge
    const overlayStart = Date.now();
    const worldKnowledgeWithOverlay = await this.applyChangelogOverlay(
      worldKnowledgeResult,
      campaignId
    );
    const changelogOverlayTime = Date.now() - overlayStart;

    const totalAssemblyTime = Date.now() - startTime;

    const result: ContextAssembly = {
      worldKnowledge: worldKnowledgeWithOverlay,
      planningContext: planningContextResults,
      metadata: {
        graphRAGQueryTime,
        changelogOverlayTime,
        planningContextTime,
        totalAssemblyTime,
        cached: false,
      },
    };

    // Store in cache
    ContextAssemblyService.cache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + this.cacheTTL,
    });

    return result;
  }

  /**
   * Query GraphRAG for world knowledge using semantic entity search + graph traversal
   */
  async queryGraphRAG(
    query: string,
    campaignId: string,
    options: { maxEntities: number; maxNeighborsPerEntity: number }
  ): Promise<WorldKnowledgeResult> {
    const startTime = Date.now();

    // Generate query embedding for semantic search
    const [queryEmbedding] =
      await this.planningContextService.generateEmbeddings([query]);

    // Find similar entities using semantic search
    const similarEntities =
      await this.entityEmbeddingService.findSimilarByEmbedding(queryEmbedding, {
        campaignId,
        topK: options.maxEntities,
      });

    const daoFactory = getDAOFactory(this.env);
    const entitiesWithRelationships: EntityWithRelationships[] = [];

    // Process each found entity and expand with graph traversal
    for (const similar of similarEntities) {
      // Only include if similarity score is reasonable (above 0.3)
      if (similar.score < 0.3) {
        continue;
      }

      const entity = await daoFactory.entityDAO.getEntityById(similar.entityId);
      if (!entity || entity.campaignId !== campaignId) {
        continue;
      }

      // Get relationships for this entity
      const relationships =
        await this.entityGraphService.getRelationshipsForEntity(
          campaignId,
          entity.id
        );

      // Get neighbors via graph traversal
      const neighbors = await this.entityGraphService.getNeighbors(
        campaignId,
        entity.id,
        {
          maxDepth: 2,
        }
      );

      entitiesWithRelationships.push({
        ...entity,
        relationships,
        neighbors: neighbors.slice(0, options.maxNeighborsPerEntity),
        relevanceScore: similar.score,
      });
    }

    const queryTime = Date.now() - startTime;

    return {
      entities: entitiesWithRelationships,
      totalEntities: entitiesWithRelationships.length,
      queryTime,
    };
  }

  /**
   * Apply changelog overlays to world knowledge to show current world state
   */
  async applyChangelogOverlay(
    worldKnowledge: WorldKnowledgeResult,
    campaignId: string
  ): Promise<WorldKnowledgeWithOverlay> {
    const startTime = Date.now();

    // Get overlay snapshot from changelog service
    const overlaySnapshot =
      await this.worldStateChangelogService.getOverlaySnapshot(campaignId);

    // Apply overlays to entities
    const entitiesWithOverlay: EntityWithRelationshipsAndOverlay[] =
      worldKnowledge.entities.map((entity) => {
        const entityWithOverlay =
          this.worldStateChangelogService.applyEntityOverlay(
            entity,
            overlaySnapshot
          );

        // Apply overlays to relationships
        const relationshipsWithOverlay =
          this.worldStateChangelogService.applyRelationshipOverlay(
            entity.relationships,
            overlaySnapshot
          );

        return {
          ...entityWithOverlay,
          relationships: relationshipsWithOverlay,
        };
      });

    // Include new entities from changelog
    const newEntities = Object.values(overlaySnapshot.newEntities);
    for (const newEntity of newEntities) {
      // Try to fetch the entity if it exists in the graph now
      const daoFactory = getDAOFactory(this.env);
      const entity = await daoFactory.entityDAO.getEntityById(
        newEntity.entity_id
      );
      if (entity) {
        const relationships =
          await this.entityGraphService.getRelationshipsForEntity(
            campaignId,
            entity.id
          );
        const neighbors = await this.entityGraphService.getNeighbors(
          campaignId,
          entity.id,
          { maxDepth: 2 }
        );

        entitiesWithOverlay.push({
          ...entity,
          relationships,
          neighbors: neighbors.slice(0, 5),
          relevanceScore: 0.8, // New entities get high relevance
        });
      }
    }

    const overlayApplicationTime = Date.now() - startTime;

    return {
      ...worldKnowledge,
      entities: entitiesWithOverlay,
      overlaySnapshot,
      overlayAppliedAt: new Date().toISOString(),
      overlayApplicationTime,
    };
  }
}
