import type { D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import { getDAOFactory } from "@/dao/dao-factory";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";
import { WorldStateChangelogService } from "@/services/graph/world-state-changelog-service";
import { PlanningContextService } from "@/services/rag/planning-context-service";
import { TelemetryDAO } from "@/dao/telemetry-dao";
import { TelemetryService } from "@/services/telemetry/telemetry-service";
import type {
  EntityNeighbor,
  EntityRelationship,
  Entity,
} from "@/dao/entity-dao";
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

interface NeighborhoodCacheEntry {
  data: EntityNeighbor[];
  expiresAt: number;
}

interface RelationshipCacheEntry {
  data: EntityRelationship[];
  expiresAt: number;
}

export class ContextAssemblyService {
  private entityGraphService: EntityGraphService;
  private entityEmbeddingService: EntityEmbeddingService;
  private worldStateChangelogService: WorldStateChangelogService;
  private planningContextService: PlanningContextService;
  private telemetryService: TelemetryService;

  // In-memory cache with TTL (5 minutes default)
  private static cache = new Map<string, CacheEntry>();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes in milliseconds

  // Neighborhood cache with TTL (2 minutes)
  private static neighborhoodCache = new Map<string, NeighborhoodCacheEntry>();
  private readonly neighborhoodCacheTTL = 2 * 60 * 1000; // 2 minutes

  // Relationship cache with TTL (5 minutes)
  private static relationshipCache = new Map<string, RelationshipCacheEntry>();
  private readonly relationshipCacheTTL = 5 * 60 * 1000; // 5 minutes

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
    this.telemetryService = new TelemetryService(new TelemetryDAO(db));
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
   * Generate cache key for neighborhood
   */
  private generateNeighborhoodCacheKey(
    entityId: string,
    maxDepth: number,
    relationshipTypes?: string[]
  ): string {
    const typesKey = relationshipTypes
      ? relationshipTypes.sort().join(",")
      : "all";
    return `neighborhood:${entityId}:${maxDepth}:${typesKey}`;
  }

  /**
   * Generate cache key for relationships
   */
  private generateRelationshipCacheKey(
    entityId: string,
    relationshipType?: string
  ): string {
    const typeKey = relationshipType || "all";
    return `relationships:${entityId}:${typeKey}`;
  }

  /**
   * Get cached neighborhood or null if not cached/expired
   */
  private getCachedNeighborhood(
    entityId: string,
    maxDepth: number,
    relationshipTypes?: string[]
  ): EntityNeighbor[] | null {
    const key = this.generateNeighborhoodCacheKey(
      entityId,
      maxDepth,
      relationshipTypes
    );
    const entry = ContextAssemblyService.neighborhoodCache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.data;
    }
    if (entry) {
      ContextAssemblyService.neighborhoodCache.delete(key);
    }
    return null;
  }

  /**
   * Cache neighborhood data
   */
  private setCachedNeighborhood(
    entityId: string,
    maxDepth: number,
    neighbors: EntityNeighbor[],
    relationshipTypes?: string[]
  ): void {
    const key = this.generateNeighborhoodCacheKey(
      entityId,
      maxDepth,
      relationshipTypes
    );
    ContextAssemblyService.neighborhoodCache.set(key, {
      data: neighbors,
      expiresAt: Date.now() + this.neighborhoodCacheTTL,
    });
  }

  /**
   * Get cached relationships or null if not cached/expired
   */
  private getCachedRelationships(
    entityId: string,
    relationshipType?: string
  ): EntityRelationship[] | null {
    const key = this.generateRelationshipCacheKey(entityId, relationshipType);
    const entry = ContextAssemblyService.relationshipCache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.data;
    }
    if (entry) {
      ContextAssemblyService.relationshipCache.delete(key);
    }
    return null;
  }

  /**
   * Cache relationships data
   */
  private setCachedRelationships(
    entityId: string,
    relationships: EntityRelationship[],
    relationshipType?: string
  ): void {
    const key = this.generateRelationshipCacheKey(entityId, relationshipType);
    ContextAssemblyService.relationshipCache.set(key, {
      data: relationships,
      expiresAt: Date.now() + this.relationshipCacheTTL,
    });
  }

  /**
   * Invalidate neighborhood and relationship caches for specific entities
   */
  static invalidateEntityCaches(entityIds: string[]): void {
    for (const entityId of entityIds) {
      // Invalidate all neighborhood caches for this entity
      const neighborhoodKeysToDelete: string[] = [];
      for (const key of ContextAssemblyService.neighborhoodCache.keys()) {
        if (key.startsWith(`neighborhood:${entityId}:`)) {
          neighborhoodKeysToDelete.push(key);
        }
      }
      for (const key of neighborhoodKeysToDelete) {
        ContextAssemblyService.neighborhoodCache.delete(key);
      }

      // Invalidate all relationship caches for this entity
      const relationshipKeysToDelete: string[] = [];
      for (const key of ContextAssemblyService.relationshipCache.keys()) {
        if (key.startsWith(`relationships:${entityId}:`)) {
          relationshipKeysToDelete.push(key);
        }
      }
      for (const key of relationshipKeysToDelete) {
        ContextAssemblyService.relationshipCache.delete(key);
      }
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

    // Record query latency metrics (fire and forget)
    this.telemetryService
      .recordQueryLatency(totalAssemblyTime, {
        campaignId,
        queryType: "context_assembly",
        metadata: {
          graphRAGQueryTime,
          changelogOverlayTime,
          planningContextTime,
        },
      })
      .catch((error) => {
        console.error("[ContextAssembly] Failed to record telemetry:", error);
      });

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

    // Filter by similarity score and collect entity IDs
    const validEntityIds = similarEntities
      .filter((similar) => similar.score >= 0.3)
      .map((similar) => similar.entityId);

    if (validEntityIds.length === 0) {
      return {
        entities: [],
        totalEntities: 0,
        queryTime: Date.now() - startTime,
      };
    }

    const daoFactory = getDAOFactory(this.env);

    // Check caches for relationships and neighbors
    const cachedRelationships = new Map<string, EntityRelationship[]>();
    const cachedNeighbors = new Map<string, EntityNeighbor[]>();
    const uncachedEntityIds: string[] = [];
    let relationshipCacheHits = 0;
    let relationshipCacheMisses = 0;
    let neighborhoodCacheHits = 0;
    let neighborhoodCacheMisses = 0;

    for (const entityId of validEntityIds) {
      const cachedRel = this.getCachedRelationships(entityId);
      const cachedNeigh = this.getCachedNeighborhood(entityId, 2);

      if (cachedRel) {
        cachedRelationships.set(entityId, cachedRel);
        relationshipCacheHits++;
      } else {
        relationshipCacheMisses++;
      }

      if (cachedNeigh) {
        cachedNeighbors.set(entityId, cachedNeigh);
        neighborhoodCacheHits++;
      } else {
        neighborhoodCacheMisses++;
      }

      // If either is missing from cache, we need to fetch
      if (!cachedRel || !cachedNeigh) {
        uncachedEntityIds.push(entityId);
      }
    }

    // Batch fetch entities, and only fetch relationships/neighbors for uncached entities
    const fetchPromises: [
      Promise<Entity[]>,
      Promise<Map<string, EntityRelationship[]>>,
      Promise<Map<string, EntityNeighbor[]>>,
    ] = [
      daoFactory.entityDAO.getEntitiesByIds(validEntityIds),
      uncachedEntityIds.length > 0
        ? this.entityGraphService.getRelationshipsForEntities(
            campaignId,
            uncachedEntityIds
          )
        : Promise.resolve(new Map()),
      uncachedEntityIds.length > 0
        ? this.entityGraphService.getNeighborsBatch(
            campaignId,
            uncachedEntityIds,
            {
              maxDepth: 2,
            }
          )
        : Promise.resolve(new Map()),
    ];

    const [entities, fetchedRelationshipsMap, fetchedNeighborsMap] =
      await Promise.all(fetchPromises);

    // Merge cached and fetched data
    const relationshipsMap = new Map(cachedRelationships);
    const neighborsMap = new Map(cachedNeighbors);

    for (const [entityId, relationships] of fetchedRelationshipsMap) {
      relationshipsMap.set(entityId, relationships);
      // Cache the fetched relationships
      this.setCachedRelationships(entityId, relationships);
    }

    for (const [entityId, neighbors] of fetchedNeighborsMap) {
      neighborsMap.set(entityId, neighbors);
      // Cache the fetched neighbors
      this.setCachedNeighborhood(entityId, 2, neighbors);
    }

    // Build result array, preserving order and relevance scores
    const entitiesWithRelationships: EntityWithRelationships[] = [];
    const scoreMap = new Map(similarEntities.map((s) => [s.entityId, s.score]));

    for (const entity of entities) {
      if (entity.campaignId !== campaignId) {
        continue;
      }

      const relationships = relationshipsMap.get(entity.id) || [];
      const neighbors = (neighborsMap.get(entity.id) || []).slice(
        0,
        options.maxNeighborsPerEntity
      );

      entitiesWithRelationships.push({
        ...entity,
        relationships,
        neighbors,
        relevanceScore: scoreMap.get(entity.id) || 0,
      });
    }

    const queryTime = Date.now() - startTime;

    // Record cache metrics to telemetry (fire and forget)
    this.telemetryService
      .recordQueryLatency(queryTime, {
        campaignId,
        queryType: "graphrag_query",
        metadata: {
          relationshipCacheHits,
          relationshipCacheMisses,
          neighborhoodCacheHits,
          neighborhoodCacheMisses,
          totalEntities: validEntityIds.length,
          uncachedEntities: uncachedEntityIds.length,
        },
      })
      .catch((error) => {
        console.error(
          "[ContextAssembly] Failed to record cache telemetry:",
          error
        );
      });

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
