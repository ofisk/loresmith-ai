import type {
	CreateEntityRelationshipInput,
	EntityDAO,
	EntityNeighbor,
	EntityRelationship,
} from "@/dao/entity-dao";
import {
	EntityNotFoundError,
	SelfReferentialRelationshipError,
} from "@/lib/errors";
import type { RelationshipType } from "@/lib/relationship-types";
import {
	getReciprocalRelationshipType,
	isBidirectionalRelationship,
	normalizeRelationshipStrength,
	normalizeRelationshipType,
	RELATIONSHIP_TYPES,
} from "@/lib/relationship-types";
import { ContextAssemblyService } from "@/services/context/context-assembly-service";

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
			throw new SelfReferentialRelationshipError();
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

		// Invalidate caches for affected entities
		ContextAssemblyService.invalidateEntityCaches([
			input.fromEntityId,
			input.toEntityId,
		]);

		return created;
	}

	/**
	 * Batch upsert edges. More efficient than calling upsertEdge repeatedly.
	 */
	async upsertEdgesBatch(inputs: UpsertGraphEdgeInput[]): Promise<void> {
		if (inputs.length === 0) return;

		const entityIds = new Set<string>();
		const payloads: CreateEntityRelationshipInput[] = [];

		for (const input of inputs) {
			const normalizedType = normalizeRelationshipType(input.relationshipType);
			const normalizedStrength = normalizeRelationshipStrength(input.strength);

			if (!input.allowSelfRelation && input.fromEntityId === input.toEntityId) {
				throw new SelfReferentialRelationshipError();
			}

			entityIds.add(input.fromEntityId);
			entityIds.add(input.toEntityId);

			payloads.push({
				campaignId: input.campaignId,
				fromEntityId: input.fromEntityId,
				toEntityId: input.toEntityId,
				relationshipType: normalizedType,
				strength: normalizedStrength,
				metadata: input.metadata,
			});

			if (isBidirectionalRelationship(normalizedType)) {
				const reciprocalType = getReciprocalRelationshipType(normalizedType);
				if (reciprocalType) {
					payloads.push({
						campaignId: input.campaignId,
						fromEntityId: input.toEntityId,
						toEntityId: input.fromEntityId,
						relationshipType: reciprocalType,
						strength: normalizedStrength,
						metadata: input.metadata,
					});
				}
			}
		}

		const campaignId = inputs[0].campaignId;
		await this.ensureEntitiesInCampaign(campaignId, Array.from(entityIds));
		await this.entityDAO.upsertRelationshipsBatch(payloads);
		ContextAssemblyService.invalidateEntityCaches(Array.from(entityIds));
	}

	async removeEdgeById(relationshipId: string): Promise<void> {
		// Note: Cache invalidation skipped here since we don't have entity IDs
		// Cache will expire naturally or be invalidated on next relationship update
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

		// Invalidate caches for affected entities
		ContextAssemblyService.invalidateEntityCaches([fromEntityId, toEntityId]);
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

	async getRelationshipsForEntities(
		campaignId: string,
		entityIds: string[],
		options: { relationshipType?: string } = {}
	): Promise<Map<string, EntityRelationship[]>> {
		if (entityIds.length === 0) {
			return new Map();
		}
		await this.ensureEntitiesInCampaign(campaignId, entityIds);

		return this.entityDAO.getRelationshipsForEntities(entityIds, {
			relationshipType: options.relationshipType
				? normalizeRelationshipType(options.relationshipType)
				: undefined,
		});
	}

	async getNeighborsBatch(
		campaignId: string,
		entityIds: string[],
		options: GraphTraversalOptions = {}
	): Promise<Map<string, EntityNeighbor[]>> {
		if (entityIds.length === 0) {
			return new Map();
		}
		await this.ensureEntitiesInCampaign(campaignId, entityIds);

		const normalizedTypes = options.relationshipTypes?.map((type) =>
			normalizeRelationshipType(type)
		);

		return this.entityDAO.getRelationshipNeighborhoodBatch(entityIds, {
			maxDepth: options.maxDepth,
			relationshipTypes: normalizedTypes,
		});
	}

	private async ensureEntitiesInCampaign(
		campaignId: string,
		entityIds: string[]
	): Promise<void> {
		const uniqueIds = Array.from(new Set(entityIds));
		if (uniqueIds.length === 0) {
			return;
		}

		const entities = await this.entityDAO.getEntitiesByIds(uniqueIds);

		for (const entityId of uniqueIds) {
			const entity = entities.find((e) => e.id === entityId);
			if (!entity || entity.campaignId !== campaignId) {
				throw new EntityNotFoundError(entityId, campaignId);
			}
		}
	}
}
