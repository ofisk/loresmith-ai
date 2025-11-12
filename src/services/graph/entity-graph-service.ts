import type {
  CreateEntityRelationshipInput,
  EntityDAO,
  EntityRelationship,
  EntityNeighbor,
} from "@/dao/entity-dao";
import {
  RELATIONSHIP_TYPES,
  normalizeRelationshipStrength,
  normalizeRelationshipType,
  isBidirectionalRelationship,
  getReciprocalRelationshipType,
} from "@/lib/relationship-types";
import type { RelationshipType } from "@/lib/relationship-types";

interface UpsertGraphEdgeInput {
  campaignId: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: string;
  strength?: number | null;
  metadata?: unknown;
  allowSelfRelation?: boolean;
}

interface GraphTraversalOptions {
  maxDepth?: number;
  relationshipTypes?: string[];
}

export class EntityGraphService {
  constructor(private readonly entityDAO: EntityDAO) {}

  getSupportedRelationshipTypes(): RelationshipType[] {
    return [...RELATIONSHIP_TYPES];
  }

  async upsertEdge(input: UpsertGraphEdgeInput): Promise<EntityRelationship[]> {
    const normalizedType = normalizeRelationshipType(input.relationshipType);
    const normalizedStrength = normalizeRelationshipStrength(input.strength);

    if (!input.allowSelfRelation && input.fromEntityId === input.toEntityId) {
      throw new Error("Self-referential relationships are not permitted");
    }

    await this.ensureEntitiesInCampaign(input.campaignId, [
      input.fromEntityId,
      input.toEntityId,
    ]);

    const edgePayload: CreateEntityRelationshipInput = {
      campaignId: input.campaignId,
      fromEntityId: input.fromEntityId,
      toEntityId: input.toEntityId,
      relationshipType: normalizedType,
      strength: normalizedStrength,
      metadata: input.metadata,
    };

    const created: EntityRelationship[] = [];

    const forward = await this.entityDAO.upsertRelationship(edgePayload);
    created.push(forward);

    const normalizedForwardType = normalizeRelationshipType(
      forward.relationshipType
    );

    if (isBidirectionalRelationship(normalizedForwardType)) {
      const reciprocalType = getReciprocalRelationshipType(
        normalizedForwardType
      );
      if (reciprocalType) {
        const reverse = await this.entityDAO.upsertRelationship({
          campaignId: input.campaignId,
          fromEntityId: input.toEntityId,
          toEntityId: input.fromEntityId,
          relationshipType: reciprocalType,
          strength: normalizedStrength,
          metadata: input.metadata,
        });
        created.push(reverse);
      }
    }

    return created;
  }

  async removeEdgeById(relationshipId: string): Promise<void> {
    await this.entityDAO.deleteRelationship(relationshipId);
  }

  async removeEdgeByCompositeKey(
    campaignId: string,
    fromEntityId: string,
    toEntityId: string,
    relationshipType: string
  ): Promise<void> {
    await this.ensureEntitiesInCampaign(campaignId, [fromEntityId, toEntityId]);
    await this.entityDAO.deleteRelationshipByCompositeKey(
      fromEntityId,
      toEntityId,
      normalizeRelationshipType(relationshipType)
    );
  }

  async getRelationshipsForEntity(
    campaignId: string,
    entityId: string,
    options: { relationshipType?: string } = {}
  ): Promise<EntityRelationship[]> {
    await this.ensureEntitiesInCampaign(campaignId, [entityId]);

    return this.entityDAO.getRelationshipsForEntity(entityId, {
      relationshipType: options.relationshipType
        ? normalizeRelationshipType(options.relationshipType)
        : undefined,
    });
  }

  async getNeighbors(
    campaignId: string,
    entityId: string,
    options: GraphTraversalOptions = {}
  ): Promise<EntityNeighbor[]> {
    await this.ensureEntitiesInCampaign(campaignId, [entityId]);

    const normalizedTypes = options.relationshipTypes?.map((type) =>
      normalizeRelationshipType(type)
    );

    return this.entityDAO.getRelationshipNeighborhood(entityId, {
      maxDepth: options.maxDepth,
      relationshipTypes: normalizedTypes,
    });
  }

  private async ensureEntitiesInCampaign(
    campaignId: string,
    entityIds: string[]
  ): Promise<void> {
    const uniqueIds = Array.from(new Set(entityIds));
    const entities = await Promise.all(
      uniqueIds.map((id) => this.entityDAO.getEntityById(id))
    );

    for (const entity of entities) {
      if (!entity || entity.campaignId !== campaignId) {
        throw new Error("Entity not found for campaign");
      }
    }
  }
}
