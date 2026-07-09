import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindCommunitiesContainingEntity = vi.hoisted(() => vi.fn());
const mockFindCommunitiesContainingEntities = vi.hoisted(() => vi.fn());

const mockGenerateSummary = vi.hoisted(() =>
	vi.fn().mockResolvedValue("# Session plan\n\n## Scene 1")
);

const mockPlanningTaskDAO = vi.hoisted(() => ({
	listByCampaign: vi.fn(),
	listCompletedForSessionReadout: vi.fn(),
	getById: vi.fn(),
}));

const mockSessionDigestDAO = vi.hoisted(() => ({
	getNextSessionNumber: vi.fn(),
}));

const mockSessionPlanReadoutDAO = vi.hoisted(() => ({
	get: vi.fn(),
	save: vi.fn(),
}));

const mockSessionPlanReadoutChunkDAO = vi.hoisted(() => ({
	getChunks: vi.fn(),
	saveChunk: vi.fn(),
	clearChunks: vi.fn(),
}));

const mockCommunityDAO = vi.hoisted(() => ({
	findCommunitiesContainingEntity: mockFindCommunitiesContainingEntity,
	findCommunitiesContainingEntities: mockFindCommunitiesContainingEntities,
}));

const mockDaoFactory = vi.hoisted(() => ({
	planningTaskDAO: mockPlanningTaskDAO,
	sessionDigestDAO: mockSessionDigestDAO,
	sessionPlanReadoutDAO: mockSessionPlanReadoutDAO,
	sessionPlanReadoutChunkDAO: mockSessionPlanReadoutChunkDAO,
	communityDAO: mockCommunityDAO,
}));

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => mockDaoFactory),
}));

vi.mock("@/lib/env-utils", () => ({
	getEnvVar: vi.fn().mockResolvedValue("test-api-key"),
}));

vi.mock("@/services/llm/llm-provider-factory", () => ({
	createLLMProvider: vi.fn(() => ({
		generateSummary: mockGenerateSummary,
	})),
}));

const mockSearchExecute = vi.hoisted(() => vi.fn());
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

	const baseTasks = [
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
	];

	beforeEach(() => {
		vi.clearAllMocks();
		mockSessionDigestDAO.getNextSessionNumber.mockResolvedValue(2);
		mockSessionPlanReadoutDAO.get.mockResolvedValue(null);
		mockSessionPlanReadoutChunkDAO.clearChunks.mockResolvedValue(undefined);
		mockSessionPlanReadoutDAO.save.mockResolvedValue(undefined);
		mockGenerateSummary.mockResolvedValue("# Session plan\n\n## Scene 1");

		mockPlanningTaskDAO.listCompletedForSessionReadout.mockResolvedValue(
			baseTasks
		);

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
		await getSessionReadoutContext.execute?.(
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

	it("returns a generated plan for 3+ completed tasks without useChunkedFlow", async () => {
		mockPlanningTaskDAO.listCompletedForSessionReadout.mockResolvedValue([
			...baseTasks,
			{
				id: "task-3",
				title: "Plan the finale",
				completionNotes: "Boss fight on the bridge",
				createdAt: "2024-01-03T00:00:00Z",
				targetSessionNumber: 2,
			},
		]);

		const result = await getSessionReadoutContext.execute?.(
			{ campaignId, jwt, forceRegenerate: true },
			options
		);

		expect(result?.result?.success).toBe(true);
		expect(result?.result?.data).toMatchObject({
			plan: expect.stringContaining("Session plan"),
			nextSessionNumber: 2,
			cached: false,
		});
		expect(result?.result?.data).not.toHaveProperty("useChunkedFlow");
		expect(mockGenerateSummary).toHaveBeenCalled();
		expect(mockSessionPlanReadoutDAO.save).toHaveBeenCalled();
		expect(mockSessionPlanReadoutChunkDAO.clearChunks).toHaveBeenCalled();
	});

	it("excludes legacy completed tasks that are not for the upcoming session", async () => {
		mockPlanningTaskDAO.listCompletedForSessionReadout.mockResolvedValue([
			{
				id: "task-1",
				title: "Prep Vallaki",
				completionNotes: "Session 2 prep",
				createdAt: "2024-01-01T00:00:00Z",
				targetSessionNumber: 2,
			},
			{
				id: "task-old",
				title: "Old prep (target: session 1)",
				completionNotes: "Should be ignored",
				createdAt: "2024-01-02T00:00:00Z",
				targetSessionNumber: null,
			},
			{
				id: "task-other",
				title: "Pinned to session 3",
				completionNotes: "Wrong session",
				createdAt: "2024-01-03T00:00:00Z",
				targetSessionNumber: 3,
			},
		]);

		await getSessionReadoutContext.execute?.(
			{ campaignId, jwt, forceRegenerate: true },
			options
		);

		expect(
			mockPlanningTaskDAO.listCompletedForSessionReadout
		).toHaveBeenCalledWith(campaignId, 2);
		expect(mockSearchExecute).toHaveBeenCalled();
		const searchCalls = mockSearchExecute.mock.calls.length;
		expect(searchCalls).toBeLessThanOrEqual(2);
	});

	it("includes completion notes in the LLM prompt when search returns no entities", async () => {
		mockSearchExecute.mockResolvedValue({
			result: { success: true, data: { results: [] } },
		});
		mockPlanningTaskDAO.listCompletedForSessionReadout.mockResolvedValue([
			{
				id: "task-1",
				title: "Write opening scene",
				completionNotes: "Start in the tavern with a mysterious stranger",
				createdAt: "2024-01-01T00:00:00Z",
				targetSessionNumber: 2,
			},
		]);

		await getSessionReadoutContext.execute?.(
			{ campaignId, jwt, forceRegenerate: true },
			options
		);

		const prompt = mockGenerateSummary.mock.calls[0]?.[0] as string;
		expect(prompt).toContain("mysterious stranger");
		expect(prompt).toContain("Completion notes");
	});

	it("falls back to PIPELINE_LIGHT when primary session plan LLM fails transiently", async () => {
		mockGenerateSummary
			.mockRejectedValueOnce(
				new Error(
					"Failed to generate summary: Failed after 3 attempts. Last error: ",
					{
						cause: {
							name: "AI_RetryError",
							reason: "maxRetriesExceeded",
							errors: [
								{
									statusCode: 529,
									responseBody: '{"type":"overloaded_error"}',
									message: "",
								},
							],
						},
					}
				)
			)
			.mockResolvedValueOnce("# Session plan (fallback)\n\n## Scene 1");

		const result = await getSessionReadoutContext.execute?.(
			{ campaignId, jwt, forceRegenerate: true },
			options
		);

		expect(result?.result?.success).toBe(true);
		expect(mockGenerateSummary).toHaveBeenCalledTimes(2);
		const fallbackCall = mockGenerateSummary.mock.calls[1]?.[1] as {
			model?: string;
		};
		expect(fallbackCall?.model).toBeDefined();
		expect(result?.result?.data).toMatchObject({
			plan: expect.stringContaining("fallback"),
		});
	});
});
