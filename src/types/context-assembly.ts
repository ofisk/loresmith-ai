import type {
  Entity,
  EntityRelationship,
  EntityNeighbor,
} from "@/dao/entity-dao";
import type {
  WorldStateOverlaySnapshot,
  WorldStateEntityOverlay,
  WorldStateRelationshipOverlay,
} from "@/services/graph/world-state-changelog-service";
import type { PlanningContextSearchResult } from "@/services/rag/planning-context-service";

/**
 * Result from GraphRAG query containing world knowledge
 */
export interface WorldKnowledgeResult {
  entities: EntityWithRelationships[];
  totalEntities: number;
  queryTime: number;
}

/**
 * Entity with its relationships and neighbors from graph traversal
 */
export interface EntityWithRelationships extends Entity {
  relationships: EntityRelationship[];
  neighbors: EntityNeighbor[];
  relevanceScore: number;
}

/**
 * World knowledge with changelog overlays applied
 */
export interface WorldKnowledgeWithOverlay extends WorldKnowledgeResult {
  overlaySnapshot: WorldStateOverlaySnapshot;
  entities: EntityWithRelationshipsAndOverlay[];
  overlayAppliedAt: string;
  overlayApplicationTime: number;
}

/**
 * Entity with overlays applied showing current world state
 */
export interface EntityWithRelationshipsAndOverlay
  extends EntityWithRelationships {
  worldState?: WorldStateEntityOverlay;
  relationships: Array<
    EntityRelationship & {
      worldState?: WorldStateRelationshipOverlay;
    }
  >;
}

/**
 * Options for context assembly query
 */
export interface ContextAssemblyOptions {
  maxEntities?: number;
  maxNeighborsPerEntity?: number;
  maxPlanningContextResults?: number;
  applyRecencyWeighting?: boolean;
  fromDate?: string;
  toDate?: string;
  sectionTypes?: string[];
}

/**
 * Performance metadata for context assembly
 */
export interface ContextAssemblyMetadata {
  graphRAGQueryTime: number;
  changelogOverlayTime: number;
  planningContextTime: number;
  totalAssemblyTime: number;
  cached: boolean;
}

/**
 * Complete context assembly result combining all tiers
 */
export interface ContextAssembly {
  worldKnowledge: WorldKnowledgeWithOverlay;
  planningContext: PlanningContextSearchResult[];
  metadata: ContextAssemblyMetadata;
}
