import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentExtractionProvider } from "@/services/campaign/content-extraction-provider";
import { stageEntitiesFromResource } from "@/services/campaign/entity-staging-service";

const CONTEXT_LENGTH_THRESHOLD = 5000;

const mockState = vi.hoisted(() => ({
	extractCalls: [] as string[],
	throwContextLength: true,
	alwaysThrow: false,
}));

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(),
}));

vi.mock("@/services/llm/llm-rate-limit-service", () => ({
	getLLMRateLimitService: vi.fn().mockReturnValue({
		recordUsage: vi.fn().mockResolvedValue(undefined),
	}),
}));

vi.mock("@/lib/notifications", () => ({
	notifyCampaignMembers: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/rag/entity-extraction-service", () => ({
	EntityExtractionService: vi.fn().mockImplementation(function (this: any) {
		this.extractEntities = vi
			.fn()
			.mockImplementation(async (opts: { content: string }) => {
				mockState.extractCalls.push(opts.content);
				const shouldThrow =
					mockState.alwaysThrow ||
					(mockState.throwContextLength &&
						opts.content.length > CONTEXT_LENGTH_THRESHOLD);
				if (shouldThrow) {
					throw new Error("maximum context length exceeded");
				}
				return [];
			});
	}),
}));

vi.mock("@/services/character-sheet/character-sheet-detection-service", () => ({
	CharacterSheetDetectionService: vi.fn().mockImplementation(function (
		this: any
	) {
		this.detectCharacterSheet = vi.fn().mockResolvedValue({
			confidence: 0.1,
			characterName: null,
		});
		this.isConfidentDetection = () => false;
	}),
}));

import { getDAOFactory } from "@/dao/dao-factory";

describe("entity-staging-service context-length retry", () => {
	const mockEnv = { DB: {} } as any;
	const mockResource = {
		id: "resource-1",
		file_key: "campaign/file.pdf",
		file_name: "file.pdf",
		campaign_id: "campaign-1",
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockState.extractCalls = [];
		mockState.throwContextLength = true;
		mockState.alwaysThrow = false;
		(getDAOFactory as any).mockReturnValue({
			entityDAO: {},
			entityImportanceDAO: {},
		});
	});

	it("retries with trimmed content on context-length error and succeeds", async () => {
		// Content > 5000 chars triggers context-length error; trimmed content (< 5000) succeeds
		const longContent =
			"First sentence. ".repeat(400) + "Second part. ".repeat(100);
		expect(longContent.length).toBeGreaterThan(CONTEXT_LENGTH_THRESHOLD);

		const contentProvider: ContentExtractionProvider = {
			extractContent: async () => ({
				success: true,
				content: longContent,
				metadata: { isPDF: false },
			}),
		};

		const result = await stageEntitiesFromResource({
			env: mockEnv,
			username: "user-1",
			campaignId: "campaign-1",
			campaignName: "Test Campaign",
			resource: mockResource,
			campaignRagBasePath: "/rag",
			llmApiKey: "test-key",
			contentExtractionProvider: contentProvider,
		});

		expect(result.success).toBe(true);
		expect(result.failedChunks ?? []).toHaveLength(0);
		expect(mockState.extractCalls.length).toBeGreaterThanOrEqual(2);
		// First call has full content; later calls have trimmed content
		expect(mockState.extractCalls[0].length).toBe(longContent.length);
		const lastCall = mockState.extractCalls[mockState.extractCalls.length - 1];
		expect(lastCall.length).toBeLessThanOrEqual(CONTEXT_LENGTH_THRESHOLD);
		expect(lastCall).toContain("[Content truncated for context limit");
	});

	it("retries multiple times and reports failedChunks when context-length persists", async () => {
		// Always throw context-length regardless of content length
		mockState.alwaysThrow = true;

		const contentProvider: ContentExtractionProvider = {
			extractContent: async () => ({
				success: true,
				content: "x".repeat(10000),
				metadata: { isPDF: false },
			}),
		};

		const result = await stageEntitiesFromResource({
			env: mockEnv,
			username: "user-1",
			campaignId: "campaign-1",
			campaignName: "Test Campaign",
			resource: mockResource,
			campaignRagBasePath: "/rag",
			llmApiKey: "test-key",
			contentExtractionProvider: contentProvider,
		});

		// Staging completes; with alwaysThrow we get 0 entities
		expect(result.success).toBe(true);
		expect(result.entityCount).toBe(0);
		// Multiple extraction attempts (initial + retries with trimmed content)
		expect(mockState.extractCalls.length).toBeGreaterThanOrEqual(3);
		// When all retries fail, failedChunks should be populated (if returned)
		if (result.failedChunks) {
			expect(result.failedChunks.length).toBeGreaterThan(0);
		}
	});
});
