import type { Community } from "@/dao/community-dao";
import type { CommunityHierarchy } from "@/services/graph/community-detection-service";

/**
 * Find all communities containing a specific entity
 */
export async function findCommunitiesContainingEntity(
  communityDAO: {
    findCommunitiesContainingEntity: (
      campaignId: string,
      entityId: string
    ) => Promise<Community[]>;
  },
  campaignId: string,
  entityId: string
): Promise<Community[]> {
  return communityDAO.findCommunitiesContainingEntity(campaignId, entityId);
}

/**
 * Get the primary community for an entity (the one at the lowest level)
 */
export async function getPrimaryCommunityForEntity(
  communityDAO: {
    findCommunitiesContainingEntity: (
      campaignId: string,
      entityId: string
    ) => Promise<Community[]>;
  },
  campaignId: string,
  entityId: string
): Promise<Community | null> {
  const communities = await communityDAO.findCommunitiesContainingEntity(
    campaignId,
    entityId
  );

  if (communities.length === 0) {
    return null;
  }

  // Return the community at the lowest level (most specific)
  return communities.reduce((lowest, current) => {
    return current.level > lowest.level ? current : lowest;
  }, communities[0]);
}

/**
 * Build a complete hierarchy tree from a list of communities
 */
export function buildCommunityHierarchyTree(
  communities: Community[]
): CommunityHierarchy[] {
  const communityMap = new Map<string, Community>();
  const rootCommunities: Community[] = [];

  // Index all communities
  for (const community of communities) {
    communityMap.set(community.id, community);
  }

  // Find root communities (no parent)
  for (const community of communities) {
    if (!community.parentCommunityId) {
      rootCommunities.push(community);
    }
  }

  // Build hierarchy recursively
  function buildHierarchy(community: Community): CommunityHierarchy {
    const children: CommunityHierarchy[] = [];

    // Find all children of this community
    for (const other of communities) {
      if (other.parentCommunityId === community.id) {
        children.push(buildHierarchy(other));
      }
    }

    return {
      community,
      children,
    };
  }

  return rootCommunities.map(buildHierarchy);
}

/**
 * Get all entities in a community hierarchy (including nested communities)
 */
export function getAllEntitiesInHierarchy(
  hierarchy: CommunityHierarchy
): string[] {
  const entitySet = new Set<string>();

  function collectEntities(node: CommunityHierarchy) {
    for (const entityId of node.community.entityIds) {
      entitySet.add(entityId);
    }

    for (const child of node.children) {
      collectEntities(child);
    }
  }

  collectEntities(hierarchy);
  return Array.from(entitySet);
}

/**
 * Get the depth of a community hierarchy
 */
export function getHierarchyDepth(hierarchy: CommunityHierarchy): number {
  if (hierarchy.children.length === 0) {
    return 1;
  }

  return (
    1 + Math.max(...hierarchy.children.map((child) => getHierarchyDepth(child)))
  );
}

/**
 * Find communities by metadata property
 */
export function findCommunitiesByMetadata(
  communities: Community[],
  key: string,
  value: unknown
): Community[] {
  return communities.filter((community) => {
    if (!community.metadata || typeof community.metadata !== "object") {
      return false;
    }

    const metadata = community.metadata as Record<string, unknown>;
    return metadata[key] === value;
  });
}

/**
 * Get community statistics
 */
export interface CommunityStats {
  totalCommunities: number;
  totalEntities: number;
  averageCommunitySize: number;
  maxCommunitySize: number;
  minCommunitySize: number;
  levels: number;
  communitiesByLevel: Map<number, number>;
}

export function calculateCommunityStats(
  communities: Community[]
): CommunityStats {
  if (communities.length === 0) {
    return {
      totalCommunities: 0,
      totalEntities: 0,
      averageCommunitySize: 0,
      maxCommunitySize: 0,
      minCommunitySize: 0,
      levels: 0,
      communitiesByLevel: new Map(),
    };
  }

  const entitySet = new Set<string>();
  const sizes: number[] = [];
  const communitiesByLevel = new Map<number, number>();
  let maxLevel = 0;

  for (const community of communities) {
    for (const entityId of community.entityIds) {
      entitySet.add(entityId);
    }

    sizes.push(community.entityIds.length);

    const count = communitiesByLevel.get(community.level) || 0;
    communitiesByLevel.set(community.level, count + 1);

    maxLevel = Math.max(maxLevel, community.level);
  }

  const totalEntities = entitySet.size;
  const totalCommunities = communities.length;
  const averageCommunitySize =
    sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
  const maxCommunitySize = Math.max(...sizes);
  const minCommunitySize = Math.min(...sizes);

  return {
    totalCommunities,
    totalEntities,
    averageCommunitySize,
    maxCommunitySize,
    minCommunitySize,
    levels: maxLevel + 1,
    communitiesByLevel,
  };
}

/**
 * Filter communities by size
 */
export function filterCommunitiesBySize(
  communities: Community[],
  minSize?: number,
  maxSize?: number
): Community[] {
  return communities.filter((community) => {
    const size = community.entityIds.length;
    if (minSize !== undefined && size < minSize) {
      return false;
    }
    if (maxSize !== undefined && size > maxSize) {
      return false;
    }
    return true;
  });
}

/**
 * Get communities at a specific level
 */
export function getCommunitiesAtLevel(
  communities: Community[],
  level: number
): Community[] {
  return communities.filter((community) => community.level === level);
}

/**
 * Get all ancestors of a community
 */
export async function getCommunityAncestors(
  communityDAO: { getCommunityById: (id: string) => Promise<Community | null> },
  community: Community
): Promise<Community[]> {
  const ancestors: Community[] = [];
  let current: Community | null = community;

  while (current?.parentCommunityId) {
    const parent = await communityDAO.getCommunityById(
      current.parentCommunityId
    );
    if (parent) {
      ancestors.push(parent);
      current = parent;
    } else {
      break;
    }
  }

  return ancestors.reverse(); // Return from root to immediate parent
}

/**
 * Get all descendants of a community
 */
export async function getCommunityDescendants(
  communityDAO: { getChildCommunities: (id: string) => Promise<Community[]> },
  community: Community
): Promise<Community[]> {
  const descendants: Community[] = [];
  const children = await communityDAO.getChildCommunities(community.id);

  for (const child of children) {
    descendants.push(child);
    const childDescendants = await getCommunityDescendants(communityDAO, child);
    descendants.push(...childDescendants);
  }

  return descendants;
}
