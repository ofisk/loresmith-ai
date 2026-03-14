import { beforeEach, describe, expect, it, vi } from "vitest";
import { estimateTokenCount } from "@/lib/token-utils";
import { trimToolResultsByRelevancy } from "@/lib/tool-result-trimming";

const mockGetImportanceByEntityIds = vi.hoisted(() => vi.fn());

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => ({
		entityImportanceDAO: {
			getImportanceByEntityIds: mockGetImportanceByEntityIds,
		},
	})),
}));

describe("trimToolResultsByRelevancy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetImportanceByEntityIds.mockResolvedValue([]);
	});

	it("uses one batch importance lookup and keeps higher-priority items", async () => {
		mockGetImportanceByEntityIds.mockResolvedValue([
			{
				entityId: "entity-1",
				campaignId: "campaign-1",
				pagerank: 0.9,
				betweennessCentrality: 0.9,
				hierarchyLevel: 90,
				importanceScore: 100,
				computedAt: "2026-01-01T00:00:00Z",
			},
		]);

		const toolResult = {
			results: [
				{ entityId: "entity-1", score: 0.1, content: "a".repeat(320) },
				{ entityId: "entity-2", score: 0.9, content: "b".repeat(320) },
			],
		};

		const trimmed = (await trimToolResultsByRelevancy(
			toolResult,
			120,
			{ DB: {} },
			"campaign-1"
		)) as { results: Array<{ entityId: string }> };

		expect(mockGetImportanceByEntityIds).toHaveBeenCalledTimes(1);
		expect(mockGetImportanceByEntityIds).toHaveBeenCalledWith([
			"entity-1",
			"entity-2",
		]);
		expect(trimmed.results).toHaveLength(1);
		expect(trimmed.results[0].entityId).toBe("entity-1");
		expect(estimateTokenCount(JSON.stringify(trimmed))).toBeLessThanOrEqual(
			120
		);
	});

	it("preserves envelope shape when trimming nested result data", async () => {
		const toolResult = {
			toolCallId: "call-1",
			result: {
				success: true,
				data: {
					results: [
						{ entityId: "entity-1", score: 0.5, content: "x".repeat(280) },
						{ entityId: "entity-2", score: 0.4, content: "y".repeat(280) },
					],
				},
			},
		};

		const trimmed = (await trimToolResultsByRelevancy(
			toolResult,
			100,
			{ DB: {} },
			"campaign-1"
		)) as {
			toolCallId: string;
			result: {
				success: boolean;
				data: { results: Array<{ entityId: string }> };
			};
		};

		expect(trimmed.toolCallId).toBe("call-1");
		expect(trimmed.result.success).toBe(true);
		expect(Array.isArray(trimmed.result.data.results)).toBe(true);
		expect(trimmed.result.data.results.length).toBeLessThan(2);
		expect(estimateTokenCount(JSON.stringify(trimmed))).toBeLessThanOrEqual(
			100
		);
	});

	it("returns original result and skips DAO lookup when already within budget", async () => {
		const toolResult = {
			results: [{ entityId: "entity-1", score: 0.8, content: "short" }],
		};

		const trimmed = await trimToolResultsByRelevancy(
			toolResult,
			1000,
			{ DB: {} },
			"campaign-1"
		);

		expect(trimmed).toEqual(toolResult);
		expect(mockGetImportanceByEntityIds).not.toHaveBeenCalled();
	});

	it("strips verbose metadata and relationships proactively", async () => {
		const toolResult = {
			results: [
				{
					entityId: "e1",
					score: 0.9,
					title: "Entity 1",
					text: "Content here",
					metadata: { shardStatus: "approved", resourceId: "r1" },
					relationships: [
						{ relationshipType: "knows", otherEntityName: "Entity 2" },
					],
					fileKey: "file-uuid-123",
				},
			],
		};

		const trimmed = (await trimToolResultsByRelevancy(
			toolResult,
			1000,
			{ DB: {} },
			null
		)) as { results: Array<Record<string, unknown>> };

		expect(trimmed.results).toHaveLength(1);
		const item = trimmed.results[0];
		expect(item.entityId).toBe("e1");
		expect(item.score).toBe(0.9);
		expect(item.title).toBe("Entity 1");
		expect(item.text).toBe("Content here");
		expect(item.metadata).toBeUndefined();
		expect(item.relationships).toBeUndefined();
		expect(item.fileKey).toBeUndefined();
	});

	it("preserves relatedEntities for planning context graph linkage", async () => {
		const relatedEntities = [
			{
				entityId: "camp-1_npc-1",
				entityName: "Gareth",
				entityType: "npc",
				neighbors: [],
				matchedKeywords: ["gareth", "innkeeper"],
			},
		];
		const toolResult = {
			results: [
				{
					title: "Session 5 - key_events",
					text: "The party met Gareth at the inn.",
					relatedEntities,
				},
			],
		};

		const trimmed = (await trimToolResultsByRelevancy(
			toolResult,
			1000,
			{ DB: {} },
			null
		)) as { results: Array<{ relatedEntities: typeof relatedEntities }> };

		expect(trimmed.results[0].relatedEntities).toEqual(relatedEntities);
	});

	it("truncates long text fields proactively", async () => {
		const longText = "x".repeat(10000);
		const toolResult = {
			results: [{ entityId: "e1", score: 0.9, text: longText }],
		};

		const trimmed = (await trimToolResultsByRelevancy(
			toolResult,
			5000,
			{ DB: {} },
			null
		)) as { results: Array<{ text: string }> };

		expect(trimmed.results[0].text.length).toBeLessThan(longText.length);
		expect(trimmed.results[0].text).toContain("[truncated for context length]");
	});
});
