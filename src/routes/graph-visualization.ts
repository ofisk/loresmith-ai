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
  toCommunityNodeBasic,
  toEntityEdge,
  toInterCommunityEdge,
  getCommunityName,
} from "@/lib/graph/community-utils";
import {
  applyGraphFilters,
  buildCommunityGraphNodes,
  buildRelationshipMap,
  computeOrphanNodes,
  type GraphFilters,
} from "@/lib/graph/graph-visualization-helpers";
import type { CommunitySummary } from "@/dao/community-summary-dao";
import { EntitySemanticSearchService } from "@/services/vectorize/entity-semantic-search-service";
import { OpenAIEmbeddingService } from "@/services/embedding/openai-embedding-service";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { isEntityStub } from "@/lib/entity-content-merge";

type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

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
    const resourceIdsParam = c.req.query("resourceIds");

    const entityTypes = entityTypesParam
      ? entityTypesParam.split(",").map((t) => t.trim())
      : undefined;
    const relationshipTypes = relationshipTypesParam
      ? relationshipTypesParam.split(",").map((t) => t.trim())
      : undefined;
    const approvalStatuses = approvalStatusesParam
      ? approvalStatusesParam.split(",").map((s) => s.trim())
      : undefined;
    const resourceIds = resourceIdsParam
      ? resourceIdsParam
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
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

    // Load all entities for the campaign to check filters (exclude stubs so they are not rendered)
    const allEntities = await daoFactory.entityDAO.listEntitiesByCampaign(
      campaignId,
      { limit: 10000 }
    );
    const nonStubEntities = allEntities.filter((e) => !isEntityStub(e));

    // Create entity map for quick lookup (stubs excluded)
    const entityMap = new Map<string, Entity>();
    for (const entity of nonStubEntities) {
      entityMap.set(entity.id, entity);
    }

    // Batch load relationships for all entities (used for filters and edges)
    const allEntityIds = nonStubEntities.map((e) => e.id);
    const relationshipsByEntity =
      allEntityIds.length > 0
        ? await daoFactory.entityDAO.getRelationshipsForEntities(allEntityIds)
        : new Map();
    const relationshipMap = buildRelationshipMap(relationshipsByEntity);

    const filters: GraphFilters = {
      entityTypes,
      approvalStatuses: approvalStatuses as ShardStatus[] | undefined,
      relationshipTypes,
      resourceIds,
    };

    // Filter communities using pre-built relationship map
    const filteredCommunities = applyGraphFilters(
      communities,
      entityMap,
      filters,
      relationshipMap
    );

    // Load community summaries
    const communitySummaryMap = new Map<string, CommunitySummary>();
    if (daoFactory.communitySummaryDAO) {
      for (const community of filteredCommunities) {
        try {
          const summary =
            await daoFactory.communitySummaryDAO.getSummaryByCommunityId(
              community.id
            );
          if (summary) {
            communitySummaryMap.set(community.id, summary);
          }
        } catch {
          // Ignore errors loading summaries
        }
      }
    }

    // Build community nodes
    const communityNodes = buildCommunityGraphNodes(
      filteredCommunities,
      entityMap,
      communitySummaryMap
    );

    // Compute orphan nodes (entities not in any filtered community)
    const entityIdsInCommunities = new Set<string>();
    for (const community of filteredCommunities) {
      for (const entityId of community.entityIds) {
        entityIdsInCommunities.add(entityId);
      }
    }
    const orphanNodes = computeOrphanNodes(
      nonStubEntities,
      entityIdsInCommunities,
      filters,
      relationshipMap
    );

    const nodes: CommunityGraphData["nodes"] = [
      ...communityNodes,
      ...orphanNodes,
    ];

    // Build inter-community edges
    const edges: CommunityGraphData["edges"] = [];
    const edgeMap = new Map<string, Map<string, Set<string>>>();

    const entityToCommunityMap = new Map<string, string>();
    for (const community of filteredCommunities) {
      for (const entityId of community.entityIds) {
        entityToCommunityMap.set(entityId, community.id);
      }
    }

    const filteredEntityIds = new Set<string>();
    for (const community of filteredCommunities) {
      for (const entityId of community.entityIds) {
        filteredEntityIds.add(entityId);
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

    // Filter to only entities in this community, not rejected/ignored, and not stubs
    const communityEntities = allEntities.filter((entity) => {
      if (!entityIdsSet.has(entity.id)) {
        return false;
      }
      if (isEntityStub(entity)) {
        return false;
      }
      const metadata = entity.metadata as Record<string, unknown> | undefined;
      if (!metadata) {
        return true;
      }
      const shardStatus = metadata.shardStatus as ShardStatus | undefined;
      const ignored = metadata.ignored === true;
      return (
        shardStatus !== "rejected" && shardStatus !== "deleted" && !ignored
      );
    });

    // Build entity nodes (stubs already excluded from communityEntities)
    const communityEntityIds = new Set(communityEntities.map((e) => e.id));
    const nodes: EntityGraphData["nodes"] = [];
    for (const entity of communityEntities) {
      nodes.push({
        id: entity.id,
        name: entity.name,
        entityType: entity.entityType,
      });
    }

    // Load relationships between entities in this community (batch)
    const edges: EntityGraphData["edges"] = [];
    const processedEdges = new Set<string>();
    const entityIdsArray = Array.from(communityEntityIds);
    const relationshipsByEntity =
      entityIdsArray.length > 0
        ? await daoFactory.entityDAO.getRelationshipsForEntities(entityIdsArray)
        : new Map();

    for (const [, relationships] of relationshipsByEntity) {
      for (const rel of relationships) {
        if (
          !communityEntityIds.has(rel.fromEntityId) ||
          !communityEntityIds.has(rel.toEntityId)
        ) {
          continue;
        }

        const edgeKey = [rel.fromEntityId, rel.toEntityId].sort().join("|");
        if (processedEdges.has(edgeKey)) {
          continue;
        }
        processedEdges.add(edgeKey);

        edges.push(toEntityEdge(rel));
      }
    }

    // Get community name/summary
    let communityName: string;
    if (daoFactory.communitySummaryDAO) {
      try {
        const summary =
          await daoFactory.communitySummaryDAO.getSummaryByCommunityId(
            communityId
          );
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

const SEMANTIC_SIMILARITY_THRESHOLD = 0.3;
const SEMANTIC_TOP_K = 15;
const LEXICAL_NAME_MATCH_LIMIT = 50;

/**
 * Build one EntitySearchResult from an entity and its communities.
 */
function toEntitySearchResult(
  entity: Entity,
  communities: Community[],
  communitySummaryMap: Map<string, CommunitySummary>,
  matchType: "primary" | "associated"
): EntitySearchResult {
  return {
    entityId: entity.id,
    entityName: entity.name,
    entityType: entity.entityType,
    communities: communities.map((community) =>
      toCommunityNodeBasic(community, communitySummaryMap)
    ),
    matchType,
  };
}

/**
 * GET /api/campaigns/:campaignId/graph-visualization/search-entity
 * Search for entities (semantic or lexical) and include associated entities
 * (e.g. entities related to a location). Returns an array of EntitySearchResult.
 */
export async function handleSearchEntityInGraph(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth as AuthPayload | undefined;
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
    const searchInParam = c.req.query("searchIn");

    if (!entityName && !entityId) {
      return c.json(
        { error: "entityName or entityId query parameter required" },
        400
      );
    }

    const graphService = new EntityGraphService(daoFactory.entityDAO);
    const primaryEntities: Entity[] = [];
    const associatedEntityIds = new Set<string>();

    if (entityId) {
      const entity = await daoFactory.entityDAO.getEntityById(entityId);
      if (!entity || entity.campaignId !== campaignId || isEntityStub(entity)) {
        return c.json({ error: "Entity not found" }, 404);
      }
      primaryEntities.push(entity);
    } else if (entityName) {
      const primaryIds = new Set<string>();

      const openaiApiKey =
        userAuth.openaiApiKey || (c.env.OPENAI_API_KEY as string | undefined);
      if (c.env.VECTORIZE && openaiApiKey) {
        const openaiEmbeddingService = new OpenAIEmbeddingService(openaiApiKey);
        const getQueryEmbedding = async (q: string) => {
          const [emb] = await openaiEmbeddingService.generateEmbeddings([q]);
          return emb;
        };
        const semanticSearch = new EntitySemanticSearchService(
          c.env.VECTORIZE,
          getQueryEmbedding
        );
        const matches = await semanticSearch.searchEntities(
          campaignId,
          entityName,
          {
            topK: SEMANTIC_TOP_K,
            minScore: SEMANTIC_SIMILARITY_THRESHOLD,
          }
        );
        for (const m of matches) {
          const entity = await daoFactory.entityDAO.getEntityById(m.entityId);
          if (
            entity &&
            entity.campaignId === campaignId &&
            !isEntityStub(entity)
          ) {
            primaryEntities.push(entity);
            primaryIds.add(entity.id);
          }
        }
      }

      // Lexical search: name and/or content (optional searchIn=name|content|name,content)
      const nameTrimmed = entityName.trim();
      const allowedFields = ["name", "content"] as const;
      const parsedSearchIn = searchInParam
        ?.split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is "name" | "content" =>
          allowedFields.includes(s as (typeof allowedFields)[number])
        );
      const searchIn = parsedSearchIn?.length
        ? parsedSearchIn
        : [...allowedFields];
      if (nameTrimmed) {
        const lexicalMatches = await daoFactory.entityDAO.searchEntitiesByText(
          campaignId,
          nameTrimmed,
          {
            fields: [...searchIn],
            limit: LEXICAL_NAME_MATCH_LIMIT,
          }
        );
        for (const e of lexicalMatches) {
          if (isEntityStub(e) || primaryIds.has(e.id)) continue;
          primaryEntities.push(e);
          primaryIds.add(e.id);
        }
      }
    }

    if (primaryEntities.length === 0) {
      return c.json({ error: "Entity not found" }, 404);
    }

    // Exclude stubs from primary and associated lists
    const primaryFiltered = primaryEntities.filter((e) => !isEntityStub(e));
    if (primaryFiltered.length === 0) {
      return c.json({ error: "Entity not found" }, 404);
    }

    for (const entity of primaryFiltered) {
      const neighbors = await graphService.getNeighbors(campaignId, entity.id, {
        maxDepth: 1,
      });
      for (const n of neighbors) {
        if (n.entityId && !primaryFiltered.some((e) => e.id === n.entityId)) {
          associatedEntityIds.add(n.entityId);
        }
      }
    }

    const associatedEntities: Entity[] = [];
    for (const id of associatedEntityIds) {
      const entity = await daoFactory.entityDAO.getEntityById(id);
      if (entity && entity.campaignId === campaignId && !isEntityStub(entity)) {
        associatedEntities.push(entity);
      }
    }

    const allEntities = [...primaryFiltered, ...associatedEntities];
    const allCommunityIds = new Set<string>();
    const entityCommunities = new Map<string, Community[]>();

    for (const entity of allEntities) {
      const communities =
        await daoFactory.communityDAO.findCommunitiesContainingEntity(
          campaignId,
          entity.id
        );
      entityCommunities.set(entity.id, communities);
      for (const comm of communities) allCommunityIds.add(comm.id);
    }

    const communitySummaryMap = new Map<string, CommunitySummary>();
    if (daoFactory.communitySummaryDAO) {
      for (const cid of allCommunityIds) {
        try {
          const summary =
            await daoFactory.communitySummaryDAO.getSummaryByCommunityId(cid);
          if (summary) communitySummaryMap.set(cid, summary);
        } catch {
          // Ignore
        }
      }
    }

    const results: EntitySearchResult[] = [];
    for (const entity of primaryFiltered) {
      const communities = entityCommunities.get(entity.id) ?? [];
      results.push(
        toEntitySearchResult(
          entity,
          communities,
          communitySummaryMap,
          "primary"
        )
      );
    }
    for (const entity of associatedEntities) {
      const communities = entityCommunities.get(entity.id) ?? [];
      results.push(
        toEntitySearchResult(
          entity,
          communities,
          communitySummaryMap,
          "associated"
        )
      );
    }

    return c.json(results);
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
