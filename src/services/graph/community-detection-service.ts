import type { EntityDAO, EntityRelationship } from "@/dao/entity-dao";
import type {
  CommunityDAO,
  Community,
  CreateCommunityInput,
} from "@/dao/community-dao";
import type { CommunitySummaryDAO } from "@/dao/community-summary-dao";
import {
  detectCommunities,
  type GraphEdge,
  type LeidenOptions,
} from "@/lib/graph/leiden-algorithm";
import { CommunitySummaryService } from "./community-summary-service";

export interface CommunityDetectionOptions extends LeidenOptions {
  minCommunitySize?: number; // Minimum number of entities in a community
  maxLevels?: number; // Maximum hierarchy levels to detect
  maxEntities?: number; // Maximum entities to process (safety limit)
  maxRelationships?: number; // Maximum relationships to process (safety limit)
}

// Default safety limits for community detection
const DEFAULT_MAX_ENTITIES = 50000;
const DEFAULT_MAX_RELATIONSHIPS = 200000;

// Memory estimation constants (rough estimates in MB)
const MEMORY_ESTIMATE_BASE_MB = 5; // Base overhead
const MEMORY_ESTIMATE_PER_ENTITY_MB = 0.00005; // ~50 bytes per entity
const MEMORY_ESTIMATE_PER_RELATIONSHIP_MB = 0.0001; // ~100 bytes per relationship
const MEMORY_WARNING_THRESHOLD_MB = 80; // Warn if estimated >80MB
const MEMORY_ERROR_THRESHOLD_MB = 100; // Error if estimated >100MB

/**
 * Estimate memory usage for community detection
 * Returns estimated memory usage in MB
 */
function estimateMemoryUsage(
  entityCount: number,
  relationshipCount: number
): number {
  return (
    MEMORY_ESTIMATE_BASE_MB +
    entityCount * MEMORY_ESTIMATE_PER_ENTITY_MB +
    relationshipCount * MEMORY_ESTIMATE_PER_RELATIONSHIP_MB
  );
}

export interface CommunityHierarchy {
  community: Community;
  children: CommunityHierarchy[];
}

export interface CommunityDetectionSummaryOptions {
  generateSummaries?: boolean;
  openaiApiKey?: string;
}

export class CommunityDetectionService {
  private summaryService: CommunitySummaryService | null = null;

  constructor(
    private readonly entityDAO: EntityDAO,
    private readonly communityDAO: CommunityDAO,
    private readonly summaryDAO?: CommunitySummaryDAO,
    private readonly defaultOpenAIKey?: string
  ) {
    // Initialize summary service if summaryDAO is provided
    if (this.summaryDAO) {
      this.summaryService = new CommunitySummaryService(
        this.entityDAO,
        this.summaryDAO,
        this.defaultOpenAIKey
      );
    }
  }

  /**
   * Load minimal graph data (only IDs and edge weights) for memory efficiency
   * This avoids loading full entity content/metadata which isn't needed for community detection
   *
   * Memory savings: ~90% reduction vs loading full entity/relationship records
   * - Entity: ~2KB full record → ~36 bytes (just ID)
   * - Relationship: ~500 bytes full record → ~100 bytes (from/to/weight only)
   */
  private async loadMinimalGraphData(campaignId: string): Promise<{
    entityIds: Set<string>;
    edges: Array<{ from: string; to: string; weight: number }>;
  }> {
    const entityIds = new Set<string>();
    const edges: Array<{ from: string; to: string; weight: number }> = [];

    // Load minimal relationship data using DAO (from, to, strength, metadata)
    // Need metadata to filter out rejected/ignored relationships
    const relationshipRecords =
      await this.entityDAO.getMinimalRelationshipsForCampaign(campaignId);

    // Extract entity IDs from relationships and build edges (filtering rejected relationships)
    let rejectedRelationships = 0;
    for (const rel of relationshipRecords) {
      // Check if relationship is rejected/ignored
      let isRejected = false;
      try {
        const relMetadata = rel.metadata
          ? (JSON.parse(rel.metadata) as Record<string, unknown>)
          : {};
        if (relMetadata.rejected === true || relMetadata.ignored === true) {
          isRejected = true;
          rejectedRelationships++;
        }
      } catch (_error) {
        // If metadata parsing fails, include the relationship (safe default)
        console.warn(
          `[CommunityDetection] Failed to parse relationship metadata, including it`
        );
      }

      if (!isRejected) {
        entityIds.add(rel.fromEntityId);
        entityIds.add(rel.toEntityId);
        edges.push({
          from: rel.fromEntityId,
          to: rel.toEntityId,
          weight: rel.strength ?? 1.0,
        });
      }
    }

    if (rejectedRelationships > 0) {
      console.log(
        `[CommunityDetection] Filtered out ${rejectedRelationships} rejected/ignored relationships (${relationshipRecords.length} total, ${edges.length} included)`
      );
    }

    // Load minimal entity data using DAO (id, metadata)
    // Need metadata to filter out rejected/ignored entities
    const entityIdRecords =
      await this.entityDAO.getMinimalEntitiesForCampaign(campaignId);

    // Filter out rejected/ignored entities
    const rejectedEntityIds = new Set<string>();
    for (const record of entityIdRecords) {
      try {
        const metadata = record.metadata
          ? (JSON.parse(record.metadata) as Record<string, unknown>)
          : {};
        const shardStatus = metadata.shardStatus;
        const ignored = metadata.ignored === true;
        const rejected = metadata.rejected === true;

        // Skip rejected/ignored entities
        if (
          shardStatus === "rejected" ||
          ignored === true ||
          rejected === true
        ) {
          rejectedEntityIds.add(record.id);
          continue;
        }

        entityIds.add(record.id);
      } catch (_error) {
        // If metadata parsing fails, include the entity (safe default)
        console.warn(
          `[CommunityDetection] Failed to parse metadata for entity ${record.id}, including it`
        );
        entityIds.add(record.id);
      }
    }

    if (rejectedEntityIds.size > 0) {
      console.log(
        `[CommunityDetection] Filtered out ${rejectedEntityIds.size} rejected/ignored entities (${entityIdRecords.length} total, ${entityIds.size} included)`
      );
    }

    // Filter edges to exclude relationships involving rejected entities
    const edgesBeforeFilter = edges.length;
    const filteredEdges = edges.filter(
      (edge) =>
        !rejectedEntityIds.has(edge.from) && !rejectedEntityIds.has(edge.to)
    );

    if (filteredEdges.length < edgesBeforeFilter) {
      console.log(
        `[CommunityDetection] Filtered out ${edgesBeforeFilter - filteredEdges.length} edges involving rejected entities (${edgesBeforeFilter} total, ${filteredEdges.length} included)`
      );
    }

    return { entityIds, edges: filteredEdges };
  }

  /**
   * Detect communities for a campaign and store them in the database
   * Uses memory-efficient loading (only IDs and edges, not full entity content)
   */
  async detectCommunities(
    campaignId: string,
    options: CommunityDetectionOptions = {}
  ): Promise<Community[]> {
    // Load minimal graph data (only IDs and edges, not full entity records)
    const { entityIds, edges } = await this.loadMinimalGraphData(campaignId);

    console.log(
      `[CommunityDetection] Loaded graph data: ${entityIds.size} entities, ${edges.length} edges for campaign ${campaignId}`
    );

    if (entityIds.size === 0 || edges.length === 0) {
      console.log(
        `[CommunityDetection] No entities or relationships found for campaign ${campaignId} (entities: ${entityIds.size}, edges: ${edges.length})`
      );
      return [];
    }

    // Check safety limits
    const maxEntities = options.maxEntities ?? DEFAULT_MAX_ENTITIES;
    const maxRelationships =
      options.maxRelationships ?? DEFAULT_MAX_RELATIONSHIPS;

    if (entityIds.size > maxEntities) {
      throw new Error(
        `Campaign has too many entities (${entityIds.size} > ${maxEntities}). ` +
          `Please use a smaller subset or increase maxEntities limit.`
      );
    }

    if (edges.length > maxRelationships) {
      throw new Error(
        `Campaign has too many relationships (${edges.length} > ${maxRelationships}). ` +
          `Please use a smaller subset or increase maxRelationships limit.`
      );
    }

    // Estimate and check memory usage
    const estimatedMB = estimateMemoryUsage(entityIds.size, edges.length);

    if (estimatedMB > MEMORY_ERROR_THRESHOLD_MB) {
      throw new Error(
        `Graph too large for Worker memory (${estimatedMB.toFixed(1)}MB estimated). ` +
          `Current: ${entityIds.size} entities, ${edges.length} relationships. ` +
          `Consider using graph sampling, Durable Objects, or reducing the graph size. ` +
          `See docs/COMMUNITY_DETECTION_MEMORY.md for strategies.`
      );
    }

    if (estimatedMB > MEMORY_WARNING_THRESHOLD_MB) {
      console.warn(
        `[CommunityDetection] High memory usage estimated: ${estimatedMB.toFixed(1)}MB ` +
          `(${entityIds.size} entities, ${edges.length} relationships). ` +
          `Consider optimization if memory errors occur.`
      );
    }

    console.log(
      `[CommunityDetection] Processing ${entityIds.size} entities and ${edges.length} relationships ` +
        `(memory-efficient: only IDs and edges loaded, ~${estimatedMB.toFixed(1)}MB estimated)`
    );

    // Run Leiden algorithm (edges already in correct format)
    const assignments = detectCommunities(edges, options);

    // Group assignments by community
    const communitiesMap = new Map<number, string[]>();
    for (const assignment of assignments) {
      if (!communitiesMap.has(assignment.communityId)) {
        communitiesMap.set(assignment.communityId, []);
      }
      communitiesMap.get(assignment.communityId)!.push(assignment.nodeId);
    }

    // Filter by minimum community size
    const minSize = options.minCommunitySize ?? 2;
    const totalCommunitiesBeforeFilter = communitiesMap.size;
    const validCommunities = Array.from(communitiesMap.entries()).filter(
      ([, entityIds]) => entityIds.length >= minSize
    );

    console.log(
      `[CommunityDetection] Leiden algorithm found ${totalCommunitiesBeforeFilter} communities, ${validCommunities.length} meet minimum size requirement (minSize: ${minSize})`
    );

    if (validCommunities.length === 0 && totalCommunitiesBeforeFilter > 0) {
      const communitySizes = Array.from(communitiesMap.values()).map(
        (ids) => ids.length
      );
      const maxSize = Math.max(...communitySizes);
      console.warn(
        `[CommunityDetection] All ${totalCommunitiesBeforeFilter} communities filtered out. Largest community has ${maxSize} entities (minSize: ${minSize}). Community sizes: ${communitySizes.join(", ")}`
      );
    }

    // Delete existing communities for this campaign
    await this.communityDAO.deleteCommunitiesByCampaign(campaignId);

    // Create communities in database
    const createdCommunities: Community[] = [];
    for (const [communityId, entityIds] of validCommunities) {
      const communityInput: CreateCommunityInput = {
        id: crypto.randomUUID(),
        campaignId,
        level: 0, // Top level
        entityIds,
        metadata: {
          communityId,
          entityCount: entityIds.length,
        },
      };

      await this.communityDAO.createCommunity(communityInput);
      const created = await this.communityDAO.getCommunityById(
        communityInput.id
      );
      if (created) {
        createdCommunities.push(created);
      }
    }

    // Generate summaries asynchronously if enabled
    if (
      this.summaryService &&
      createdCommunities.length > 0 &&
      (options as any).generateSummaries !== false
    ) {
      const openaiApiKey =
        (options as any).openaiApiKey || this.defaultOpenAIKey;
      if (openaiApiKey) {
        // Generate summaries asynchronously (don't block return)
        // The generateSummariesAsync method will verify communities exist before generating summaries
        this.generateSummariesAsync(createdCommunities, openaiApiKey).catch(
          (error) => {
            console.error(
              `[CommunityDetection] Error generating summaries:`,
              error
            );
          }
        );
      }
    }

    return createdCommunities;
  }

  /**
   * Detect multi-level communities (hierarchical community detection)
   */
  async detectMultiLevelCommunities(
    campaignId: string,
    options: CommunityDetectionOptions = {}
  ): Promise<CommunityHierarchy[]> {
    const maxLevels = options.maxLevels ?? 3;

    // Start with top-level detection
    const topLevelCommunities = await this.detectCommunities(campaignId, {
      ...options,
      maxLevels: 1,
    });

    const hierarchies: CommunityHierarchy[] = [];

    // For each top-level community, recursively detect sub-communities
    for (const topCommunity of topLevelCommunities) {
      const hierarchy = await this.buildCommunityHierarchy(
        campaignId,
        topCommunity,
        0,
        maxLevels,
        options
      );
      hierarchies.push(hierarchy);
    }

    return hierarchies;
  }

  /**
   * Build community hierarchy recursively
   */
  private async buildCommunityHierarchy(
    campaignId: string,
    parentCommunity: Community,
    currentLevel: number,
    maxLevels: number,
    options: CommunityDetectionOptions
  ): Promise<CommunityHierarchy> {
    if (currentLevel >= maxLevels || parentCommunity.entityIds.length < 4) {
      // Too small or max depth reached
      return {
        community: parentCommunity,
        children: [],
      };
    }

    // Get relationships only within this community
    const relationships = await this.loadRelationshipsForEntities(
      campaignId,
      parentCommunity.entityIds
    );

    if (relationships.length === 0) {
      return {
        community: parentCommunity,
        children: [],
      };
    }

    // Convert to edges
    const edges = this.convertRelationshipsToEdges(relationships);

    // Detect sub-communities
    const assignments = detectCommunities(edges, options);

    // Group by community
    const communitiesMap = new Map<number, string[]>();
    for (const assignment of assignments) {
      if (!communitiesMap.has(assignment.communityId)) {
        communitiesMap.set(assignment.communityId, []);
      }
      communitiesMap.get(assignment.communityId)!.push(assignment.nodeId);
    }

    // Filter and create sub-communities
    const minSize = options.minCommunitySize ?? 2;
    const validSubCommunities = Array.from(communitiesMap.entries()).filter(
      ([, entityIds]) => entityIds.length >= minSize
    );

    const children: CommunityHierarchy[] = [];

    for (const [communityId, entityIds] of validSubCommunities) {
      const communityInput: CreateCommunityInput = {
        id: crypto.randomUUID(),
        campaignId,
        level: currentLevel + 1,
        parentCommunityId: parentCommunity.id,
        entityIds,
        metadata: {
          communityId,
          entityCount: entityIds.length,
        },
      };

      await this.communityDAO.createCommunity(communityInput);
      const created = await this.communityDAO.getCommunityById(
        communityInput.id
      );

      if (created) {
        // Recursively build children
        const childHierarchy = await this.buildCommunityHierarchy(
          campaignId,
          created,
          currentLevel + 1,
          maxLevels,
          options
        );
        children.push(childHierarchy);
      }
    }

    return {
      community: parentCommunity,
      children,
    };
  }

  /**
   * Rebuild all communities for a campaign
   */
  async rebuildCommunities(
    campaignId: string,
    options: CommunityDetectionOptions = {}
  ): Promise<Community[]> {
    // Delete existing communities
    await this.communityDAO.deleteCommunitiesByCampaign(campaignId);

    // Detect new communities
    return this.detectCommunities(campaignId, options);
  }

  /**
   * Incremental update: update communities after small graph changes
   * For now, this is a simplified version that rebuilds affected communities
   */
  async incrementalUpdate(
    campaignId: string,
    affectedEntityIds: string[],
    options: CommunityDetectionOptions = {}
  ): Promise<Community[]> {
    // Find communities containing affected entities
    const affectedCommunities = new Set<string>();
    for (const entityId of affectedEntityIds) {
      const communities =
        await this.communityDAO.findCommunitiesContainingEntity(
          campaignId,
          entityId
        );
      for (const community of communities) {
        affectedCommunities.add(community.id);
      }
    }

    // For simplicity, rebuild all affected communities
    // A more sophisticated implementation would only recompute the affected parts
    if (affectedCommunities.size > 0) {
      // Get all entities in affected communities
      const allAffectedEntities = new Set<string>();
      for (const communityId of affectedCommunities) {
        const community = await this.communityDAO.getCommunityById(communityId);
        if (community) {
          for (const entityId of community.entityIds) {
            allAffectedEntities.add(entityId);
          }
        }
      }

      // Delete affected communities
      for (const communityId of affectedCommunities) {
        await this.communityDAO.deleteCommunity(communityId);
      }

      // Rebuild communities for affected entities
      const relationships = await this.loadRelationshipsForEntities(
        campaignId,
        Array.from(allAffectedEntities)
      );

      if (relationships.length > 0) {
        const edges = this.convertRelationshipsToEdges(relationships);
        const assignments = detectCommunities(edges, options);

        const communitiesMap = new Map<number, string[]>();
        for (const assignment of assignments) {
          if (!communitiesMap.has(assignment.communityId)) {
            communitiesMap.set(assignment.communityId, []);
          }
          communitiesMap.get(assignment.communityId)!.push(assignment.nodeId);
        }

        const minSize = options.minCommunitySize ?? 2;
        const validCommunities = Array.from(communitiesMap.entries()).filter(
          ([, entityIds]) => entityIds.length >= minSize
        );

        const createdCommunities: Community[] = [];
        for (const [communityId, entityIds] of validCommunities) {
          const communityInput: CreateCommunityInput = {
            id: crypto.randomUUID(),
            campaignId,
            level: 0, // Simplified - would need to preserve level in real implementation
            entityIds,
            metadata: {
              communityId,
              entityCount: entityIds.length,
            },
          };

          await this.communityDAO.createCommunity(communityInput);
          const created = await this.communityDAO.getCommunityById(
            communityInput.id
          );
          if (created) {
            createdCommunities.push(created);
          }
        }

        // Generate summaries for affected communities if enabled
        if (
          this.summaryService &&
          createdCommunities.length > 0 &&
          (options as any).generateSummaries !== false
        ) {
          const openaiApiKey =
            (options as any).openaiApiKey || this.defaultOpenAIKey;
          if (openaiApiKey) {
            // Generate summaries asynchronously
            this.generateSummariesAsync(createdCommunities, openaiApiKey).catch(
              (error) => {
                console.error(
                  `[CommunityDetection] Error generating summaries for incremental update:`,
                  error
                );
              }
            );
          }
        }

        return createdCommunities;
      }
    }

    return [];
  }

  /**
   * Load relationships for specific entities
   */
  private async loadRelationshipsForEntities(
    _campaignId: string,
    entityIds: string[]
  ): Promise<EntityRelationship[]> {
    const allRelationships: EntityRelationship[] = [];
    const entityIdSet = new Set(entityIds);

    for (const entityId of entityIds) {
      const relationships =
        await this.entityDAO.getRelationshipsForEntity(entityId);
      // Filter to only include relationships within the entity set
      const filtered = relationships.filter(
        (rel) =>
          entityIdSet.has(rel.fromEntityId) && entityIdSet.has(rel.toEntityId)
      );
      allRelationships.push(...filtered);
    }

    // Deduplicate
    const seen = new Set<string>();
    return allRelationships.filter((rel) => {
      const key = `${rel.fromEntityId}-${rel.toEntityId}-${rel.relationshipType}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Convert entity relationships to graph edges
   */
  private convertRelationshipsToEdges(
    relationships: EntityRelationship[]
  ): GraphEdge[] {
    return relationships.map((rel) => ({
      from: rel.fromEntityId,
      to: rel.toEntityId,
      weight: rel.strength ?? 1.0, // Use strength if available, default to 1.0
    }));
  }

  /**
   * Generate summaries asynchronously for communities
   */
  private async generateSummariesAsync(
    communities: Community[],
    openaiApiKey: string
  ): Promise<void> {
    if (!this.summaryService) {
      return;
    }

    console.log(
      `[CommunityDetection] Generating summaries for ${communities.length} communities...`
    );

    // Verify all communities exist in database before generating summaries
    const verifiedCommunities: Community[] = [];
    for (const community of communities) {
      try {
        const existing = await this.communityDAO.getCommunityById(community.id);
        if (existing) {
          verifiedCommunities.push(existing);
        } else {
          console.warn(
            `[CommunityDetection] Community ${community.id} not found in database, skipping summary generation`
          );
        }
      } catch (error) {
        console.error(
          `[CommunityDetection] Error verifying community ${community.id}:`,
          error
        );
      }
    }

    if (verifiedCommunities.length === 0) {
      console.warn(
        `[CommunityDetection] No verified communities found, skipping summary generation`
      );
      return;
    }

    try {
      await this.summaryService.generateSummariesForCommunities(
        verifiedCommunities,
        {
          openaiApiKey,
        }
      );
      console.log(
        `[CommunityDetection] Successfully generated summaries for ${verifiedCommunities.length} communities`
      );
    } catch (error) {
      console.error(`[CommunityDetection] Error generating summaries:`, error);
    }
  }
}
