import type { Community } from "@/dao/community-dao";
import type { Entity, EntityRelationship } from "@/dao/entity-dao";
import type { CommunitySummary } from "@/dao/community-summary-dao";
import type { CommunityGraphData } from "@/types/graph-visualization";
import type { ShardStatus } from "@/types/shard";
import { toCommunityNode } from "./community-utils";

export interface GraphFilters {
  entityTypes?: string[];
  approvalStatuses?: ShardStatus[];
  relationshipTypes?: string[];
}

/** Map: entityId -> list of { toId, type } for that entity's relationships */
export type RelationshipMap = Map<
  string,
  Array<{ toId: string; type: string }>
>;

function getEntityApprovalStatus(metadata: unknown): ShardStatus {
  if (!metadata || typeof metadata !== "object") return "staging";
  const meta = metadata as Record<string, unknown>;
  const shardStatus = meta.shardStatus;
  if (
    typeof shardStatus === "string" &&
    ["staging", "approved", "rejected", "deleted"].includes(shardStatus)
  ) {
    return shardStatus as ShardStatus;
  }
  return "staging";
}

function matchesApprovalStatus(
  entity: Entity,
  approvalStatuses: ShardStatus[]
): boolean {
  return approvalStatuses.includes(getEntityApprovalStatus(entity.metadata));
}

function matchesEntityType(entity: Entity, entityTypes: string[]): boolean {
  return entityTypes.includes(entity.entityType);
}

function entityHasRelationshipTypes(
  relationshipMap: RelationshipMap,
  entityId: string,
  relationshipTypes: string[]
): boolean {
  const rels = relationshipMap.get(entityId) ?? [];
  return rels.some((r) => relationshipTypes.includes(r.type));
}

/**
 * Filter communities to those that have at least one entity matching type, approval, and relationship filters.
 */
export function applyGraphFilters(
  communities: Community[],
  entityMap: Map<string, Entity>,
  filters: GraphFilters,
  relationshipMap: RelationshipMap
): Community[] {
  const { entityTypes, approvalStatuses, relationshipTypes } = filters;
  const filtered: Community[] = [];

  for (const community of communities) {
    const communityEntities = community.entityIds
      .map((id) => entityMap.get(id))
      .filter((e): e is Entity => e !== undefined);
    if (communityEntities.length === 0) continue;

    let passes = true;
    if (entityTypes?.length) {
      if (!communityEntities.some((e) => matchesEntityType(e, entityTypes)))
        passes = false;
    }
    if (passes && approvalStatuses?.length) {
      if (
        !communityEntities.some((e) =>
          matchesApprovalStatus(e, approvalStatuses)
        )
      )
        passes = false;
    }
    if (passes && relationshipTypes?.length) {
      const hasRel = communityEntities.some((e) =>
        entityHasRelationshipTypes(relationshipMap, e.id, relationshipTypes)
      );
      if (!hasRel) passes = false;
    }
    if (passes) filtered.push(community);
  }

  return filtered;
}

/**
 * Compute orphan nodes (entities not in any filtered community) that pass the same filters.
 */
export function computeOrphanNodes(
  nonStubEntities: Entity[],
  entityIdsInCommunities: Set<string>,
  filters: GraphFilters,
  relationshipMap: RelationshipMap
): CommunityGraphData["nodes"] {
  const { entityTypes, approvalStatuses, relationshipTypes } = filters;
  const nodes: CommunityGraphData["nodes"] = [];

  for (const entity of nonStubEntities) {
    if (entityIdsInCommunities.has(entity.id)) continue;

    let passes = true;
    if (entityTypes?.length && !matchesEntityType(entity, entityTypes))
      passes = false;
    if (
      passes &&
      approvalStatuses?.length &&
      !matchesApprovalStatus(entity, approvalStatuses)
    )
      passes = false;
    if (
      passes &&
      relationshipTypes?.length &&
      !entityHasRelationshipTypes(relationshipMap, entity.id, relationshipTypes)
    )
      passes = false;

    if (passes) {
      nodes.push({
        id: entity.id,
        name: entity.name,
        entityType: entity.entityType,
        isOrphan: true as const,
      });
    }
  }

  return nodes;
}

/**
 * Build community graph nodes from filtered communities, entity map, and summaries.
 */
export function buildCommunityGraphNodes(
  filteredCommunities: Community[],
  entityMap: Map<string, Entity>,
  communitySummaryMap: Map<string, CommunitySummary>
): CommunityGraphData["nodes"] {
  return filteredCommunities.map((community) =>
    toCommunityNode(community, entityMap, communitySummaryMap)
  );
}

/**
 * Build relationship map from DAO getRelationshipsForEntities result.
 */
export function buildRelationshipMap(
  relationshipsByEntity: Map<string, EntityRelationship[]>
): RelationshipMap {
  const map: RelationshipMap = new Map();
  for (const [entityId, rels] of relationshipsByEntity) {
    map.set(
      entityId,
      rels.map((rel) => ({
        toId: rel.fromEntityId === entityId ? rel.toEntityId : rel.fromEntityId,
        type: rel.relationshipType,
      }))
    );
  }
  return map;
}
