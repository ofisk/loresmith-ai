import type { Context } from "hono";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import type { Community } from "@/dao/community-dao";
import type { Entity } from "@/dao/entity-dao";
import type {
  CommunityGraphData,
  EntityGraphData,
  EntitySearchResult,
} from "@/types/graph-visualization";
import type { ShardStatus } from "@/types/shard";
import {
  toCommunityNode,
  toCommunityNodeBasic,
  toEntityEdge,
  toInterCommunityEdge,
  getCommunityName,
} from "@/lib/graph/community-utils";
import type { CommunitySummary } from "@/dao/community-summary-dao";
import { CommunitySummaryService } from "@/services/graph/community-summary-service";

type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

/**
 * Helper to determine entity approval status from metadata
 * Uses shardStatus as the single source of truth
 */
function getEntityApprovalStatus(metadata: unknown): ShardStatus {
  if (!metadata || typeof metadata !== "object") {
    return "staging";
  }

  const meta = metadata as Record<string, unknown>;
  const shardStatus = meta.shardStatus;

  // Validate that shardStatus is a valid ShardStatus value
  if (
    typeof shardStatus === "string" &&
    (shardStatus === "staging" ||
      shardStatus === "approved" ||
      shardStatus === "rejected" ||
      shardStatus === "deleted")
  ) {
    return shardStatus as ShardStatus;
  }

  // Default to staging if shardStatus is not set or invalid
  return "staging";
}

/**
 * Helper to check if entity matches approval status filter
 */
function matchesApprovalStatus(
  entity: Entity,
  approvalStatuses: ShardStatus[]
): boolean {
  const status = getEntityApprovalStatus(entity.metadata);
  return approvalStatuses.includes(status);
}

/**
 * Helper to check if entity matches entity type filter
 */
function matchesEntityType(entity: Entity, entityTypes: string[]): boolean {
  return entityTypes.includes(entity.entityType);
}

/**
 * Helper to check if entity has relationships of specified types
 */
async function entityHasRelationshipTypes(
  entityDAO: any,
  entityId: string,
  relationshipTypes: string[]
): Promise<boolean> {
  const relationships = await entityDAO.getRelationshipsForEntity(entityId);
  for (const rel of relationships) {
    if (relationshipTypes.includes(rel.relationshipType)) {
      return true;
    }
  }
  return false;
}

/**
 * GET /api/campaigns/:campaignId/graph-visualization
 * Get community-level graph data for visualization
 */
export async function handleGetGraphVisualization(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    if (!userAuth) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const campaignId = c.req.param("campaignId");
    if (!campaignId) {
      return c.json({ error: "Campaign ID required" }, 400);
    }

    const daoFactory = getDAOFactory(c.env);
    const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
    if (!campaign || campaign.username !== userAuth.username) {
      return c.json({ error: "Campaign not found or access denied" }, 404);
    }

    // Parse query parameters for filtering
    const entityTypesParam = c.req.query("entityTypes");
    const relationshipTypesParam = c.req.query("relationshipTypes");
    const approvalStatusesParam = c.req.query("approvalStatuses");

    const entityTypes = entityTypesParam
      ? entityTypesParam.split(",").map((t) => t.trim())
      : undefined;
    const relationshipTypes = relationshipTypesParam
      ? relationshipTypesParam.split(",").map((t) => t.trim())
      : undefined;
    const approvalStatuses = approvalStatusesParam
      ? approvalStatusesParam.split(",").map((s) => s.trim())
      : undefined;

    // Load all communities
    const communities =
      await daoFactory.communityDAO.listCommunitiesByCampaign(campaignId);

    if (communities.length === 0) {
      return c.json({
        nodes: [],
        edges: [],
      });
    }

    // Load all entities for the campaign to check filters
    const allEntities = await daoFactory.entityDAO.listEntitiesByCampaign(
      campaignId,
      { limit: 10000 }
    );

    // Create entity map for quick lookup
    const entityMap = new Map<string, Entity>();
    for (const entity of allEntities) {
      entityMap.set(entity.id, entity);
    }

    // Filter communities based on filters
    const filteredCommunities: Community[] = [];
    for (const community of communities) {
      let passesFilters = true;

      // Check if community has entities matching filters
      const communityEntities = community.entityIds
        .map((id) => entityMap.get(id))
        .filter((e): e is Entity => e !== undefined);

      if (communityEntities.length === 0) {
        continue;
      }

      // Entity type filter
      if (entityTypes && entityTypes.length > 0) {
        const hasMatchingType = communityEntities.some((entity) =>
          matchesEntityType(entity, entityTypes)
        );
        if (!hasMatchingType) {
          passesFilters = false;
        }
      }

      // Approval status filter
      if (approvalStatuses && approvalStatuses.length > 0 && passesFilters) {
        const hasMatchingStatus = communityEntities.some((entity) =>
          matchesApprovalStatus(entity, approvalStatuses as ShardStatus[])
        );
        if (!hasMatchingStatus) {
          passesFilters = false;
        }
      }

      // Relationship type filter
      if (relationshipTypes && relationshipTypes.length > 0 && passesFilters) {
        let hasMatchingRelationship = false;
        for (const entity of communityEntities) {
          const hasRel = await entityHasRelationshipTypes(
            daoFactory.entityDAO,
            entity.id,
            relationshipTypes
          );
          if (hasRel) {
            hasMatchingRelationship = true;
            break;
          }
        }
        if (!hasMatchingRelationship) {
          passesFilters = false;
        }
      }

      if (passesFilters) {
        filteredCommunities.push(community);
      }
    }

    // Build community nodes with metadata
    const nodes: CommunityGraphData["nodes"] = [];
    const communitySummaryMap = new Map<string, CommunitySummary>();

    // Load existing summaries and generate on-demand for communities without them
    if (daoFactory.communitySummaryDAO) {
      const openaiApiKey = userAuth.openaiApiKey;
      const summaryService = new CommunitySummaryService(
        daoFactory.entityDAO,
        daoFactory.communitySummaryDAO,
        openaiApiKey
      );

      for (const community of filteredCommunities) {
        try {
          let summary =
            await daoFactory.communitySummaryDAO.getSummaryByCommunityId(
              community.id
            );

          // If no summary exists and we have an API key, generate one on-demand
          if (!summary && openaiApiKey) {
            try {
              console.log(
                `[GraphVisualization] Generating on-demand summary for community ${community.id}`
              );
              const result = await summaryService.generateOrGetSummary(
                community,
                { openaiApiKey }
              );
              summary = result.summary;
            } catch (error) {
              console.error(
                `[GraphVisualization] Failed to generate summary for community ${community.id}:`,
                error
              );
              // Continue without summary - will use fallback name
            }
          }

          if (summary) {
            communitySummaryMap.set(community.id, summary);
          }
        } catch {
          // Ignore errors loading summaries
        }
      }
    }

    for (const community of filteredCommunities) {
      nodes.push(toCommunityNode(community, entityMap, communitySummaryMap));
    }

    // Build inter-community edges
    const edges: CommunityGraphData["edges"] = [];
    const edgeMap = new Map<string, Map<string, Set<string>>>();

    // Create map of entity ID to community ID
    const entityToCommunityMap = new Map<string, string>();
    for (const community of filteredCommunities) {
      for (const entityId of community.entityIds) {
        entityToCommunityMap.set(entityId, community.id);
      }
    }

    // Load all relationships efficiently - we need relationship types
    // Get relationships for all entities in filtered communities
    const filteredEntityIds = new Set<string>();
    for (const community of filteredCommunities) {
      for (const entityId of community.entityIds) {
        filteredEntityIds.add(entityId);
      }
    }

    // Load relationships for entities in filtered communities
    const relationshipMap = new Map<
      string,
      Array<{ toId: string; type: string }>
    >();
    for (const entityId of filteredEntityIds) {
      try {
        const relationships =
          await daoFactory.entityDAO.getRelationshipsForEntity(entityId);
        relationshipMap.set(
          entityId,
          relationships.map((rel) => ({
            toId:
              rel.fromEntityId === entityId ? rel.toEntityId : rel.fromEntityId,
            type: rel.relationshipType,
          }))
        );
      } catch {
        // Ignore errors
      }
    }

    // Find relationships between entities in different communities
    for (const [fromEntityId, relationships] of relationshipMap.entries()) {
      const fromCommunityId = entityToCommunityMap.get(fromEntityId);
      if (!fromCommunityId) continue;

      for (const { toId, type } of relationships) {
        const toCommunityId = entityToCommunityMap.get(toId);
        if (!toCommunityId) continue;

        // Skip self-loops (same community)
        if (fromCommunityId === toCommunityId) {
          continue;
        }

        // Build edge map
        if (!edgeMap.has(fromCommunityId)) {
          edgeMap.set(fromCommunityId, new Map());
        }
        const fromMap = edgeMap.get(fromCommunityId)!;
        if (!fromMap.has(toCommunityId)) {
          fromMap.set(toCommunityId, new Set());
        }
        fromMap.get(toCommunityId)!.add(type);
      }
    }

    // Convert edge map to edges array
    for (const [sourceId, targetMap] of edgeMap.entries()) {
      for (const [targetId, relationshipTypesSet] of targetMap.entries()) {
        edges.push(
          toInterCommunityEdge(
            sourceId,
            targetId,
            Array.from(relationshipTypesSet)
          )
        );
      }
    }

    return c.json({
      nodes,
      edges,
    });
  } catch (error) {
    console.error("[GraphVisualization] Error getting graph data:", error);
    return c.json(
      {
        error: "Failed to get graph visualization data",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * GET /api/campaigns/:campaignId/graph-visualization/community/:communityId
 * Get entity-level graph data for a specific community
 */
export async function handleGetCommunityEntityGraph(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    if (!userAuth) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const campaignId = c.req.param("campaignId");
    const communityId = c.req.param("communityId");
    if (!campaignId || !communityId) {
      return c.json({ error: "Campaign ID and Community ID required" }, 400);
    }

    const daoFactory = getDAOFactory(c.env);
    const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
    if (!campaign || campaign.username !== userAuth.username) {
      return c.json({ error: "Campaign not found or access denied" }, 404);
    }

    const community =
      await daoFactory.communityDAO.getCommunityById(communityId);
    if (!community || community.campaignId !== campaignId) {
      return c.json({ error: "Community not found" }, 404);
    }

    // Load entities in the community
    const entityIdsSet = new Set(community.entityIds);
    const allEntities = await daoFactory.entityDAO.listEntitiesByCampaign(
      campaignId,
      { limit: 10000 }
    );

    // Filter to only entities in this community and not rejected/ignored
    const communityEntities = allEntities.filter((entity) => {
      if (!entityIdsSet.has(entity.id)) {
        return false;
      }

      // Filter out rejected/ignored entities
      // metadata is already parsed by mapEntityRecord
      const metadata = entity.metadata as Record<string, unknown> | undefined;
      if (!metadata) {
        return true;
      }
      const shardStatus = metadata.shardStatus as ShardStatus | undefined;
      const ignored = metadata.ignored === true;
      // Use shardStatus as single source of truth - ignore if rejected or deleted
      return (
        shardStatus !== "rejected" && shardStatus !== "deleted" && !ignored
      );
    });

    // Build entity nodes
    const nodes: EntityGraphData["nodes"] = [];
    for (const entity of communityEntities) {
      nodes.push({
        id: entity.id,
        name: entity.name,
        entityType: entity.entityType,
      });
    }

    // Load relationships between entities in this community
    const edges: EntityGraphData["edges"] = [];
    const processedEdges = new Set<string>();

    for (const entity of communityEntities) {
      const relationships =
        await daoFactory.entityDAO.getRelationshipsForEntity(entity.id);

      for (const rel of relationships) {
        // Only include relationships where both entities are in this community
        const otherEntityId =
          rel.fromEntityId === entity.id ? rel.toEntityId : rel.fromEntityId;
        if (!entityIdsSet.has(otherEntityId)) {
          continue;
        }

        // Avoid duplicates
        const edgeKey = [rel.fromEntityId, rel.toEntityId].sort().join("|");
        if (processedEdges.has(edgeKey)) {
          continue;
        }
        processedEdges.add(edgeKey);

        edges.push(toEntityEdge(rel));
      }
    }

    // Get community name/summary, generating on-demand if needed
    let communityName: string;
    if (daoFactory.communitySummaryDAO) {
      try {
        let summary =
          await daoFactory.communitySummaryDAO.getSummaryByCommunityId(
            communityId
          );

        // If no summary exists and we have an API key, generate one on-demand
        if (!summary && userAuth.openaiApiKey) {
          try {
            console.log(
              `[GraphVisualization] Generating on-demand summary for community ${communityId}`
            );
            const summaryService = new CommunitySummaryService(
              daoFactory.entityDAO,
              daoFactory.communitySummaryDAO,
              userAuth.openaiApiKey
            );
            const result = await summaryService.generateOrGetSummary(
              community,
              { openaiApiKey: userAuth.openaiApiKey }
            );
            summary = result.summary;
          } catch (error) {
            console.error(
              `[GraphVisualization] Failed to generate summary for community ${communityId}:`,
              error
            );
            // Continue without summary - will use fallback name
          }
        }

        communityName = getCommunityName(community, summary);
      } catch {
        // Ignore errors loading summary, use fallback
        communityName = `Community ${communityId.slice(0, 8)} (${community.entityIds.length})`;
      }
    } else {
      communityName = `Community ${communityId.slice(0, 8)} (${community.entityIds.length})`;
    }

    return c.json({
      communityId,
      communityName,
      nodes,
      edges,
    });
  } catch (error) {
    console.error(
      "[GraphVisualization] Error getting community entity graph:",
      error
    );
    return c.json(
      {
        error: "Failed to get community entity graph",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * GET /api/campaigns/:campaignId/graph-visualization/search-entity
 * Search for entities and find communities containing them
 */
export async function handleSearchEntityInGraph(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    if (!userAuth) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const campaignId = c.req.param("campaignId");
    if (!campaignId) {
      return c.json({ error: "Campaign ID required" }, 400);
    }

    const daoFactory = getDAOFactory(c.env);
    const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
    if (!campaign || campaign.username !== userAuth.username) {
      return c.json({ error: "Campaign not found or access denied" }, 404);
    }

    const entityName = c.req.query("entityName");
    const entityId = c.req.query("entityId");

    if (!entityName && !entityId) {
      return c.json(
        { error: "entityName or entityId query parameter required" },
        400
      );
    }

    // Find entity by ID or name
    let entity: Entity | null = null;
    if (entityId) {
      entity = await daoFactory.entityDAO.getEntityById(entityId);
    } else if (entityName) {
      const allEntities = await daoFactory.entityDAO.listEntitiesByCampaign(
        campaignId,
        { limit: 10000 }
      );
      entity =
        allEntities.find((e) =>
          e.name.toLowerCase().includes(entityName.toLowerCase())
        ) || null;
    }

    if (!entity || entity.campaignId !== campaignId) {
      return c.json({ error: "Entity not found" }, 404);
    }

    // Find communities containing this entity
    const communities =
      await daoFactory.communityDAO.findCommunitiesContainingEntity(
        campaignId,
        entity.id
      );

    // Load community summaries for names
    const communitySummaryMap = new Map<string, CommunitySummary>();
    if (daoFactory.communitySummaryDAO) {
      for (const community of communities) {
        try {
          const summary =
            await daoFactory.communitySummaryDAO.getSummaryByCommunityId(
              community.id
            );
          if (summary) {
            communitySummaryMap.set(community.id, summary);
          }
        } catch {
          // Ignore errors
        }
      }
    }

    const result: EntitySearchResult = {
      entityId: entity.id,
      entityName: entity.name,
      entityType: entity.entityType,
      communities: communities.map((community) =>
        toCommunityNodeBasic(community, communitySummaryMap)
      ),
    };

    return c.json(result);
  } catch (error) {
    console.error("[GraphVisualization] Error searching entity:", error);
    return c.json(
      {
        error: "Failed to search entity",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}
