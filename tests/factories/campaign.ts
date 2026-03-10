import type { CampaignData, CampaignResource } from "../../src/types/campaign";

const ISO_NOW = "2024-01-01T00:00:00.000Z";

/**
 * Create a type-checked campaign for testing with sensible defaults.
 * @param overrides - Partial overrides merged onto defaults
 */
export function makeCampaign(
	overrides: Partial<CampaignData> = {}
): CampaignData {
	return {
		campaignId: "campaign-test-id",
		name: "Test Campaign",
		createdAt: ISO_NOW,
		updatedAt: ISO_NOW,
		resources: [],
		...overrides,
	};
}

/**
 * Create a type-checked campaign resource for testing with sensible defaults.
 * @param overrides - Partial overrides merged onto defaults
 */
export function makeCampaignResource(
	overrides: Partial<CampaignResource> = {}
): CampaignResource {
	return {
		type: "file",
		id: "resource-test-id",
		name: "Test Resource",
		campaign_id: "campaign-test-id",
		file_key: "file/test-key",
		file_name: "test.pdf",
		status: "active",
		created_at: ISO_NOW,
		updated_at: ISO_NOW,
		...overrides,
	};
}
