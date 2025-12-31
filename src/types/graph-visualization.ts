import type { StructuredEntityType } from "@/lib/entity-types";
import type { RelationshipType } from "@/lib/relationship-types";
import type { ShardStatus } from "@/types/shard";

/**
 * Community node for graph visualization
 * Contains computed properties for rendering communities in graphs
 */
export interface CommunityNode {
  id: string;
  name: string;
  size: number;
  entityTypes: string[];
  level: number;
  summary?: string;
}

/**
 * Basic community information (subset of CommunityNode)
 * Used for lightweight community references that don't need full node data
 */
export type CommunityNodeBasic = Pick<
  CommunityNode,
  "id" | "name" | "size" | "level"
>;

/**
 * Base edge interface with common fields for graph visualization
 * Used as foundation for both community and entity edges
 */
export interface GraphEdgeBase {
  id: string;
  source: string;
  target: string;
  strength?: number;
}

/**
 * Inter-community edge for graph visualization
 * Aggregates multiple relationship types between communities
 */
export interface InterCommunityEdge extends GraphEdgeBase {
  relationshipTypes: string[];
  relationshipCount: number;
}

/**
 * Community-level graph data
 */
export interface CommunityGraphData {
  nodes: CommunityNode[];
  edges: InterCommunityEdge[];
}

/**
 * Entity node for graph visualization
 */
export interface EntityNode {
  id: string;
  name: string;
  entityType: string;
  importance?: number;
}

/**
 * Entity edge for graph visualization
 * Represents a single relationship between two entities
 */
export interface EntityEdge extends GraphEdgeBase {
  relationshipType: string;
}

/**
 * Entity-level graph data within a community
 */
export interface EntityGraphData {
  communityId: string;
  communityName?: string;
  nodes: EntityNode[];
  edges: EntityEdge[];
}

/**
 * Entity search result
 */
export interface EntitySearchResult {
  entityId: string;
  entityName: string;
  entityType: string;
  communities: CommunityNodeBasic[];
}

/**
 * Filter state for community-level view
 */
export interface CommunityFilterState {
  entityTypes?: StructuredEntityType[];
  relationshipTypes?: RelationshipType[];
  approvalStatuses?: ShardStatus[];
  communityLevel?: number;
  communitySizeMin?: number;
  communitySizeMax?: number;
}

/**
 * Filter state for entity-level view
 */
export interface EntityFilterState {
  entityTypes?: StructuredEntityType[];
  relationshipTypes?: RelationshipType[];
  searchTerm?: string;
}

/**
 * Cytoscape layout options
 */
export type CytoscapeLayout =
  | "breadthfirst"
  | "circle"
  | "concentric"
  | "cose"
  | "grid"
  | "preset"
  | "random"
  | "dagre"
  | "cola";

/**
 * View mode for graph visualization
 */
export type GraphViewMode = "community" | "entity";
