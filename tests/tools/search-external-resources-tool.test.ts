import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDaoFactory = {
	campaignDAO: {
		getCampaignByIdWithMapping: vi.fn(),
		getCampaignRole: vi.fn(),
	},
};

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => mockDaoFactory),
}));

import { searchExternalResources } from "@/tools/campaign-context/search-external-resources-tool";

const jwt = "x.eyJ1c2VybmFtZSI6Im9maXNrIn0=.y";
const options = {
	toolCallId: "ext-res-1",
	messages: [] as unknown[],
	env: { DB: {} },
} as any;

describe("search external resources tool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDaoFactory.campaignDAO.getCampaignByIdWithMapping.mockResolvedValue({
			campaignId: "campaign-1",
			name: "Test campaign",
			description: null,
			metadata: null,
		});
	});

	it("returns pre-filled search links for query and resourceType", async () => {
		const result = await searchExternalResources.execute(
			{
				campaignId: "campaign-1",
				query: "swamp encounter",
				resourceType: "adventures",
				jwt,
			},
			options
		);

		expect(result.result.success).toBe(true);
		expect(result.result.data.suggestedSearchLinks).toBeDefined();
		expect(result.result.data.suggestedSearchLinks.length).toBeGreaterThan(0);
		expect(result.result.data.query).toBe("swamp encounter");
		expect(result.result.data.resourceType).toBe("adventures");

		const dmsguild = result.result.data.suggestedSearchLinks.find(
			(l: { label: string }) => l.label === "DMs Guild"
		);
		expect(dmsguild).toBeDefined();
		expect(dmsguild.url).toContain(encodeURIComponent("swamp encounter"));
	});

	it("handles 404 when campaign not found", async () => {
		mockDaoFactory.campaignDAO.getCampaignByIdWithMapping.mockResolvedValue(
			null
		);

		const result = await searchExternalResources.execute(
			{
				campaignId: "campaign-nonexistent",
				query: "dragons",
				jwt,
			},
			options
		);

		expect(result.result.success).toBe(false);
		expect((result.result.data as { errorCode?: number }).errorCode).toBe(404);
	});

	it("handles 401 when JWT is invalid", async () => {
		const result = await searchExternalResources.execute(
			{
				campaignId: "campaign-1",
				query: "dragons",
				jwt: null,
			},
			options
		);

		expect(result.result.success).toBe(false);
		expect((result.result.data as { errorCode?: number }).errorCode).toBe(401);
	});

	it("returns error when env is not available", async () => {
		const result = await searchExternalResources.execute(
			{
				campaignId: "campaign-1",
				query: "dragons",
				jwt,
			},
			{ toolCallId: "ext-res-2", messages: [] } as any
		);

		expect(result.result.success).toBe(false);
		expect((result.result.data as { errorCode?: number }).errorCode).toBe(500);
	});
});
