import type { Community } from "../../src/dao/community-dao";

const ISO_NOW = "2024-01-01T00:00:00.000Z";

/**
 * Create a type-checked community for testing with sensible defaults.
 * @param overrides - Partial overrides merged onto defaults
 */
export function makeCommunity(overrides: Partial<Community> = {}): Community {
	return {
		id: "community-test-id",
		campaignId: "campaign-test-id",
		level: 0,
		parentCommunityId: null,
		entityIds: [],
		createdAt: ISO_NOW,
		...overrides,
	};
}
