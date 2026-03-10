import type { Entity } from "../../src/dao/entity-dao";

const ISO_NOW = "2024-01-01T00:00:00.000Z";

/**
 * Create a type-checked entity for testing with sensible defaults.
 * @param overrides - Partial overrides merged onto defaults
 */
export function makeEntity(overrides: Partial<Entity> = {}): Entity {
	return {
		id: "entity-test-id",
		campaignId: "campaign-test-id",
		entityType: "character",
		name: "Test Entity",
		createdAt: ISO_NOW,
		updatedAt: ISO_NOW,
		...overrides,
	};
}
