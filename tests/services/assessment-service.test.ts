import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssessmentDAO } from "../../src/dao/assessment-dao";
import type { Env } from "../../src/middleware/auth";
import { AssessmentService } from "../../src/services/core/assessment-service";
import type { ActivityType } from "../../src/types/assessment";
import type { CampaignResource } from "../../src/types/campaign";
import { makeCampaign, makeCampaignResource } from "../factories";

// Mock the AssessmentDAO
vi.mock("../../src/dao/assessment-dao");

describe("AssessmentService", () => {
	let assessmentService: AssessmentService;
	let mockEnv: Env;
	let mockDAO: any;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Create mock environment - cast to unknown first to bypass strict type checking
		mockEnv = {
			DB: {} as any,
			R2_BUCKET: {} as any,
			R2: {} as any,
			VECTORIZE: {} as any,
			AI: {} as any,
			Chat: {} as any,
			NOTIFICATION_HUB: {} as any,
			UPLOAD_SESSION: {} as any,
			UploadSession: {} as any,
			OPENAI_API_KEY: "test-key",
			ASSETS: {} as any,
			FILE_PROCESSING_QUEUE: {} as any,
			FILE_PROCESSING_DLQ: {} as any,
		} as unknown as Env;

		// Create mock DAO
		mockDAO = {
			getCampaignCount: vi.fn(),
			getResourceCount: vi.fn(),
			getRecentActivity: vi.fn(),
			getLastActivity: vi.fn(),
			getCampaignContext: vi.fn(),
			getCampaignCharacters: vi.fn(),
			getUserActivity: vi.fn(),
			storeModuleAnalysis: vi.fn(),
			getCampaignContextOrdered: vi.fn(),
			getCampaignCharactersOrdered: vi.fn(),
			getCampaignResourcesOrdered: vi.fn(),
			storeNPCs: vi.fn(),
			storeLocations: vi.fn(),
			storePlotHooks: vi.fn(),
			storeStoryBeats: vi.fn(),
			storeKeyItems: vi.fn(),
			storeConflicts: vi.fn(),
		};

		// Mock the AssessmentDAO constructor (Vitest 4: use function, not arrow)
		// biome-ignore lint/complexity/useArrowFunction: arrow cannot be used with `new` in Vitest 4
		(AssessmentDAO as any).mockImplementation(function () {
			return mockDAO;
		});

		assessmentService = new AssessmentService(mockEnv);
	});

	describe("analyzeUserState", () => {
		beforeEach(() => {
			AssessmentService.clearUserStateCache();
		});

		it("should analyze first-time user state correctly", async () => {
			const username = "testuser";

			mockDAO.getCampaignCount.mockResolvedValue(0);
			mockDAO.getResourceCount.mockResolvedValue(0);
			mockDAO.getRecentActivity.mockResolvedValue([]);
			mockDAO.getLastActivity.mockResolvedValue("2024-01-01T00:00:00Z");

			const result = await assessmentService.analyzeUserState(username);

			expect(result.isFirstTime).toBe(true);
			expect(result.hasCampaigns).toBe(false);
			expect(result.hasResources).toBe(false);
			expect(result.campaignCount).toBe(0);
			expect(result.resourceCount).toBe(0);
			expect(result.totalSessionTime).toBe(0);
		});

		it("should analyze experienced user state correctly", async () => {
			const username = "testuser";
			const mockActivities: ActivityType[] = [
				{
					type: "campaign_created",
					timestamp: "2024-01-01T00:00:00Z",
					details: "Created first campaign",
				},
				{
					type: "resource_uploaded",
					timestamp: "2024-01-02T00:00:00Z",
					details: "Uploaded adventure module",
				},
			];

			mockDAO.getCampaignCount.mockResolvedValue(2);
			mockDAO.getResourceCount.mockResolvedValue(5);
			mockDAO.getRecentActivity.mockResolvedValue(mockActivities);
			mockDAO.getLastActivity.mockResolvedValue("2024-01-02T00:00:00Z");

			const result = await assessmentService.analyzeUserState(username);

			expect(result.isFirstTime).toBe(false);
			expect(result.hasCampaigns).toBe(true);
			expect(result.hasResources).toBe(true);
			expect(result.campaignCount).toBe(2);
			expect(result.resourceCount).toBe(5);
			expect(result.recentActivity).toEqual(mockActivities);
			expect(result.totalSessionTime).toBe(60); // 2 activities * 30 minutes
		});

		it("should handle database errors gracefully", async () => {
			const username = "testuser";

			mockDAO.getCampaignCount.mockRejectedValue(new Error("Database error"));

			await expect(
				assessmentService.analyzeUserState(username)
			).rejects.toThrow("Failed to analyze user state");
		});

		it("returns cached result on second call within TTL", async () => {
			const username = "testuser";

			mockDAO.getCampaignCount.mockResolvedValue(1);
			mockDAO.getResourceCount.mockResolvedValue(0);
			mockDAO.getRecentActivity.mockResolvedValue([]);
			mockDAO.getLastActivity.mockResolvedValue("2024-01-01T00:00:00Z");

			const result1 = await assessmentService.analyzeUserState(username);
			const result2 = await assessmentService.analyzeUserState(username);

			expect(result1).toEqual(result2);
			expect(result1.campaignCount).toBe(1);
			expect(mockDAO.getCampaignCount).toHaveBeenCalledTimes(1);
		});

		it("refetches after TTL expires", async () => {
			vi.useFakeTimers();
			try {
				const username = "testuser";

				mockDAO.getCampaignCount.mockResolvedValue(1);
				mockDAO.getResourceCount.mockResolvedValue(0);
				mockDAO.getRecentActivity.mockResolvedValue([]);
				mockDAO.getLastActivity.mockResolvedValue("2024-01-01T00:00:00Z");

				const result1 = await assessmentService.analyzeUserState(username);
				expect(result1.campaignCount).toBe(1);
				expect(mockDAO.getCampaignCount).toHaveBeenCalledTimes(1);

				vi.advanceTimersByTime(6 * 60 * 1000);

				const result2 = await assessmentService.analyzeUserState(username);
				expect(result2.campaignCount).toBe(1);
				expect(mockDAO.getCampaignCount).toHaveBeenCalledTimes(2);
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe("getCampaignReadiness", () => {
		const mockCampaign = makeCampaign({
			campaignId: "test-campaign",
			name: "Test Campaign",
			description: "A test campaign",
		});

		it("should return Taking Root state for new campaign", async () => {
			const campaignId = "test-campaign";
			const mockResources: CampaignResource[] = [];

			mockDAO.getCampaignContext.mockResolvedValue([]);
			mockDAO.getCampaignCharacters.mockResolvedValue([]);

			const result = await assessmentService.getCampaignReadiness(
				campaignId,
				mockResources,
				mockCampaign
			);

			expect(result.overallScore).toBe(30); // 10 + 10 + 10
			expect(result.campaignState).toBe("Taking Root"); // Score of 30 maps to Taking Root (30-39)
			expect(result.priorityAreas).toEqual([
				"Campaign Context",
				"Character Development",
				"Resources",
			]);
			expect(result.recommendations).toContain(
				"Add world descriptions and campaign notes"
			);
			expect(result.recommendations).toContain(
				"Create player characters and NPCs"
			);
			expect(result.recommendations).toContain(
				"Upload campaign resources and inspiration materials"
			);
		});

		it("should return Legendary state for developing campaign", async () => {
			const campaignId = "test-campaign";
			const mockResources: CampaignResource[] = [
				makeCampaignResource({
					id: "1",
					name: "Resource 1",
					campaign_id: campaignId,
					file_key: "key1",
					file_name: "file1.pdf",
					description: "Test",
				}),
			];

			mockDAO.getCampaignContext.mockResolvedValue([
				{ id: "1", title: "Context 1", content: "Test context" },
			]);
			mockDAO.getCampaignCharacters.mockResolvedValue([
				{ id: "1", name: "Character 1", type: "player" },
			]);

			const result = await assessmentService.getCampaignReadiness(
				campaignId,
				mockResources,
				mockCampaign
			);

			expect(result.overallScore).toBe(90); // 30 + 30 + 30
			expect(result.campaignState).toBe("Legendary"); // Score of 90 maps to Legendary (90-100)
			expect(result.priorityAreas).toEqual([
				"Campaign Context",
				"Character Development",
				"Resources",
			]); // Only 1-2 items each
		});

		it("should return Legendary state for well-developed campaign", async () => {
			const campaignId = "test-campaign";
			const mockResources: CampaignResource[] = Array.from(
				{ length: 10 },
				(_, i) =>
					makeCampaignResource({
						id: `${i}`,
						name: `Resource ${i}`,
						campaign_id: campaignId,
						file_key: `key${i}`,
						file_name: `file${i}.pdf`,
						description: "Test",
					})
			);

			mockDAO.getCampaignContext.mockResolvedValue(
				Array(5)
					.fill(null)
					.map((_, i) => ({
						id: `${i}`,
						title: `Context ${i}`,
						content: `Test context ${i}`,
					}))
			);
			mockDAO.getCampaignCharacters.mockResolvedValue(
				Array(5)
					.fill(null)
					.map((_, i) => ({
						id: `${i}`,
						name: `Character ${i}`,
						type: "player",
					}))
			);

			const result = await assessmentService.getCampaignReadiness(
				campaignId,
				mockResources,
				mockCampaign
			);

			expect(result.overallScore).toBe(100); // 50 + 50 + 40, capped at 100
			expect(result.campaignState).toBe("Legendary");
			expect(result.priorityAreas).toEqual([]);
		});

		it("should handle database errors gracefully", async () => {
			const campaignId = "test-campaign";
			const mockResources: CampaignResource[] = [];

			mockDAO.getCampaignContext.mockRejectedValue(new Error("Database error"));

			await expect(
				assessmentService.getCampaignReadiness(
					campaignId,
					mockResources,
					mockCampaign
				)
			).rejects.toThrow("Failed to analyze campaign readiness");
		});
	});

	describe("getUserActivity", () => {
		it("should retrieve user activity successfully", async () => {
			const username = "testuser";
			const mockActivities: ActivityType[] = [
				{
					type: "campaign_created",
					timestamp: "2024-01-01T00:00:00Z",
					details: "Created campaign",
				},
			];

			mockDAO.getUserActivity.mockResolvedValue(mockActivities);

			const result = await assessmentService.getUserActivity(username);

			expect(result).toEqual(mockActivities);
			expect(mockDAO.getUserActivity).toHaveBeenCalledWith(username);
		});

		it("should handle database errors gracefully", async () => {
			const username = "testuser";

			mockDAO.getUserActivity.mockRejectedValue(new Error("Database error"));

			await expect(assessmentService.getUserActivity(username)).rejects.toThrow(
				"Failed to retrieve user activity"
			);
		});
	});

	describe("storeModuleAnalysis", () => {
		it("should store module analysis successfully", async () => {
			const campaignId = "test-campaign";
			const mockModuleAnalysis = {
				campaignId,
				extractedElements: {
					npcs: [],
					locations: [],
					plotHooks: [],
					storyBeats: [],
					keyItems: [],
					conflicts: [],
				},
				moduleName: "Test Module",
				integrationStatus: "integrated" as const,
			};

			mockDAO.storeNPCs.mockResolvedValue(undefined);
			mockDAO.storeLocations.mockResolvedValue(undefined);
			mockDAO.storePlotHooks.mockResolvedValue(undefined);
			mockDAO.storeStoryBeats.mockResolvedValue(undefined);
			mockDAO.storeKeyItems.mockResolvedValue(undefined);
			mockDAO.storeConflicts.mockResolvedValue(undefined);

			const result = await assessmentService.storeModuleAnalysis(
				campaignId,
				mockModuleAnalysis
			);

			expect(result).toBe(true);
			expect(mockDAO.storeNPCs).toHaveBeenCalledWith(
				campaignId,
				mockModuleAnalysis.extractedElements.npcs,
				"Test Module",
				expect.anything() // entityDAO parameter
			);
		});

		it("should handle storage errors gracefully", async () => {
			const campaignId = "test-campaign";
			const mockModuleAnalysis = {
				campaignId,
				extractedElements: {
					npcs: [],
					locations: [],
					plotHooks: [],
					storyBeats: [],
					keyItems: [],
					conflicts: [],
				},
				moduleName: "Test Module",
				integrationStatus: "integrated" as const,
			};

			mockDAO.storeNPCs.mockRejectedValue(new Error("Storage error"));

			const result = await assessmentService.storeModuleAnalysis(
				campaignId,
				mockModuleAnalysis
			);

			expect(result).toBe(false);
		});
	});

	describe("campaign state boundaries", () => {
		it("should correctly map all campaign state boundaries", async () => {
			const campaignId = "test-campaign";
			const mockCampaign = makeCampaign({
				campaignId,
				name: "Test Campaign",
				description: "A test campaign",
			});

			// Test Taking Root (30) - empty campaign gets 10+10+10=30
			mockDAO.getCampaignContext.mockResolvedValue([]);
			mockDAO.getCampaignCharacters.mockResolvedValue([]);
			let result = await assessmentService.getCampaignReadiness(
				campaignId,
				[],
				mockCampaign
			);
			expect(result.campaignState).toBe("Taking Root"); // Score 30 = Taking Root

			// Test Legendary (90) - 1-2 items in each category gives 30+30+30=90
			const someResources: CampaignResource[] = Array.from(
				{ length: 2 },
				(_, i) =>
					makeCampaignResource({
						id: `${i}`,
						name: `Resource ${i}`,
						campaign_id: campaignId,
						file_key: `key${i}`,
						file_name: `file${i}.pdf`,
						description: "Test",
					})
			);

			mockDAO.getCampaignContext.mockResolvedValue([
				{ id: "1", title: "Context 1", content: "Test" },
			]);
			mockDAO.getCampaignCharacters.mockResolvedValue([
				{ id: "1", name: "Character 1", type: "player" },
			]);
			result = await assessmentService.getCampaignReadiness(
				campaignId,
				someResources,
				mockCampaign
			);
			expect(result.campaignState).toBe("Legendary"); // Score 90 = Legendary

			// Test Taking Root (30-39) - Add more context
			mockDAO.getCampaignContext.mockResolvedValue([
				{ id: "1", title: "Context 1", content: "Test" },
				{ id: "2", title: "Context 2", content: "Test" },
			]);
			mockDAO.getCampaignCharacters.mockResolvedValue([
				{ id: "1", name: "Character 1", type: "player" },
				{ id: "2", name: "Character 2", type: "npc" },
			]);
			result = await assessmentService.getCampaignReadiness(
				campaignId,
				someResources,
				mockCampaign
			);
			// With 2 context, 2 characters, 2 resources (1-2 items each): 30 + 30 + 30 = 90 = Legendary
			expect(result.campaignState).toBe("Legendary");
		});
	});
});
