import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindCommunitiesContainingEntity = vi.fn();
const mockFindCommunitiesContainingEntities = vi.fn();

const mockPlanningTaskDAO = {
	listByCampaign: vi.fn(),
};

const mockSessionDigestDAO = {
	getNextSessionNumber: vi.fn(),
};

const mockSessionPlanReadoutDAO = {
	get: vi.fn(),
};

const mockCommunityDAO = {
	findCommunitiesContainingEntity: mockFindCommunitiesContainingEntity,
	findCommunitiesContainingEntities: mockFindCommunitiesContainingEntities,
};

const mockDaoFactory = {
	planningTaskDAO: mockPlanningTaskDAO,
	sessionDigestDAO: mockSessionDigestDAO,
	sessionPlanReadoutDAO: mockSessionPlanReadoutDAO,
	communityDAO: mockCommunityDAO,
};

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => mockDaoFactory),
}));

const mockSearchExecute = vi.fn();
vi.mock("@/tools/campaign-context/search-tools", () => ({
	searchCampaignContext: {
		execute: (...args: unknown[]) => mockSearchExecute(...args),
	},
}));

vi.mock("@/tools/utils", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/tools/utils")>();
	return {
		...actual,
		requireCanSeeSpoilersForTool: vi
			.fn()
			.mockResolvedValue({ userId: "user-1" }),
		requireCampaignAccessForTool: vi.fn().mockResolvedValue({}),
		requireGMRole: vi.fn().mockResolvedValue(undefined),
	};
});

import { getSessionReadoutContext } from "@/tools/campaign-context/recap-tools";

describe("getSessionReadoutContext", () => {
	const jwt = "x.eyJ1c2VybmFtZSI6InRlc3QtdXNlciJ9.y";
	const campaignId = "campaign-1";
	const options = {
		toolCallId: "readout-1",
		env: { DB: {} },
	} as any;

	beforeEach(() => {
		vi.clearAllMocks();
		mockSessionDigestDAO.getNextSessionNumber.mockResolvedValue(2);
		mockSessionPlanReadoutDAO.get.mockResolvedValue(null);

		mockPlanningTaskDAO.listByCampaign.mockResolvedValue([
			{
				id: "task-1",
				title: "Prep Vallaki",
				completionNotes: "Reviewed NPCs and locations",
				createdAt: "2024-01-01T00:00:00Z",
				targetSessionNumber: 2,
			},
			{
				id: "task-2",
				title: "Set up the Feast",
				completionNotes: null,
				createdAt: "2024-01-02T00:00:00Z",
				targetSessionNumber: 2,
			},
		]);

		mockSearchExecute.mockImplementation(
			async (_input: { query?: string; traverseFromEntityIds?: string[] }) => {
				if (_input.traverseFromEntityIds) {
					return {
						result: {
							success: true,
							data: {
								results: _input.traverseFromEntityIds.map((id) => ({
									entityId: id,
									title: `Entity ${id}`,
									text: `Content for ${id}`,
								})),
							},
						},
					};
				}
				return {
					result: {
						success: true,
						data: {
							results: [
								{
									entityId: "entity-1",
									title: "Entity 1",
									text: "ENTITY CONTENT (may contain unverified mentions):\n\nSome content",
								},
							],
						},
					},
				};
			}
		);

		mockFindCommunitiesContainingEntities.mockResolvedValue([
			{
				id: "comm-1",
				campaignId,
				level: 1,
				parentCommunityId: null,
				entityIds: ["entity-1", "entity-2"],
				createdAt: "2024-01-01T00:00:00Z",
			},
		]);
	});

	it("uses batch community lookup instead of per-entity loop", async () => {
		const result = await getSessionReadoutContext.execute?.(
			{ campaignId, jwt, forceRegenerate: true },
			options
		);

		expect(mockFindCommunitiesContainingEntity).not.toHaveBeenCalled();
		expect(mockFindCommunitiesContainingEntities).toHaveBeenCalledTimes(1);
		expect(mockFindCommunitiesContainingEntities).toHaveBeenCalledWith(
			campaignId,
			expect.arrayContaining(["entity-1"])
		);
		expect(
			Array.isArray(mockFindCommunitiesContainingEntities.mock.calls[0][1])
		).toBe(true);
	});

	it("runs search calls in parallel across tasks", async () => {
		let concurrentCount = 0;
		let maxConcurrent = 0;
		mockSearchExecute.mockImplementation(async () => {
			concurrentCount++;
			maxConcurrent = Math.max(maxConcurrent, concurrentCount);
			await new Promise((r) => setTimeout(r, 10));
			concurrentCount--;
			return {
				result: {
					success: true,
					data: {
						results: [
							{
								entityId: "entity-1",
								title: "Entity 1",
								text: "ENTITY CONTENT:\n\nContent",
							},
						],
					},
				},
			};
		});

		await getSessionReadoutContext.execute?.(
			{ campaignId, jwt, forceRegenerate: true },
			options
		);

		expect(maxConcurrent).toBeGreaterThanOrEqual(2);
	});
});
