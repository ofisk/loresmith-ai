import type { EntityDAO, Entity } from "@/dao/entity-dao";
import type { EntityGraphService } from "@/services/graph/entity-graph-service";

export interface EntityWithRelationships {
  entityId: string;
  entityName: string;
  entityType: string;
  description: string;
  relationships: Array<{
    targetName: string;
    relationshipType: string;
  }>;
}

export interface GetEntityWithRelationshipsOptions {
  maxNeighbors?: number;
  maxDepth?: number;
  relationshipTypes?: string[];
}

/**
 * Gets an entity with its relationships from the entity graph.
 * This is a common pattern used across multiple services for GraphRAG operations.
 *
 * @param entityId - The ID of the entity to retrieve
 * @param campaignId - The campaign ID to validate the entity belongs to
 * @param entityDAO - The entity DAO instance
 * @param entityGraphService - The entity graph service instance
 * @param options - Options for relationship retrieval
 * @returns The entity with relationships, or null if not found or doesn't belong to campaign
 */
export async function getEntityWithRelationships(
  entityId: string,
  campaignId: string,
  entityDAO: EntityDAO,
  entityGraphService: EntityGraphService,
  options: GetEntityWithRelationshipsOptions = {}
): Promise<EntityWithRelationships | null> {
  try {
    const entity = await entityDAO.getEntityById(entityId);
    if (!entity || entity.campaignId !== campaignId) {
      return null;
    }

    // Get neighbors/relationships
    const neighbors = await entityGraphService.getNeighbors(
      campaignId,
      entityId,
      {
        maxDepth: options.maxDepth ?? 1,
        relationshipTypes: options.relationshipTypes,
      }
    );

    // Extract description from content
    const description = extractEntityDescription(entity);

    return {
      entityId: entity.id,
      entityName: entity.name,
      entityType: entity.entityType,
      description,
      relationships: neighbors
        .slice(0, options.maxNeighbors ?? 5)
        .map((neighbor) => ({
          targetName: neighbor.name,
          relationshipType: neighbor.relationshipType,
        })),
    };
  } catch (error) {
    console.warn(
      `[getEntityWithRelationships] Failed to get entity ${entityId}:`,
      error
    );
    return null;
  }
}

/**
 * Extracts a description string from an entity's content.
 * Handles various content formats including player characters with backstories.
 *
 * @param entity - The entity to extract description from
 * @returns A description string extracted from the entity's content
 */
export function extractEntityDescription(entity: Entity): string {
  if (typeof entity.content === "string") {
    return entity.content;
  }

  if (entity.content && typeof entity.content === "object") {
    const content = entity.content as any;
    // For player characters, prefer backstory or summary
    if (content.backstory) {
      return content.backstory;
    }
    if (content.summary) {
      return content.summary;
    }
    // Fallback to JSON stringification
    return JSON.stringify(content);
  }

  return "";
}

/**
 * Gets multiple entities with their relationships in parallel.
 * Useful for batch operations where you need multiple entities with their graph context.
 *
 * @param entityIds - Array of entity IDs to retrieve
 * @param campaignId - The campaign ID to validate entities belong to
 * @param entityDAO - The entity DAO instance
 * @param entityGraphService - The entity graph service instance
 * @param options - Options for relationship retrieval
 * @returns Array of entities with relationships (null entries filtered out)
 */
export async function getEntitiesWithRelationships(
  entityIds: string[],
  campaignId: string,
  entityDAO: EntityDAO,
  entityGraphService: EntityGraphService,
  options: GetEntityWithRelationshipsOptions = {}
): Promise<EntityWithRelationships[]> {
  const results = await Promise.all(
    entityIds.map((entityId) =>
      getEntityWithRelationships(
        entityId,
        campaignId,
        entityDAO,
        entityGraphService,
        options
      )
    )
  );

  return results.filter(
    (result): result is EntityWithRelationships => result !== null
  );
}
