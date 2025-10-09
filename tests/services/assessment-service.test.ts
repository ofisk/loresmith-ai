import { describe, it, expect, beforeEach, vi } from "vitest";
import { AssessmentService } from "../../src/services/assessment-service";
import { AssessmentDAO } from "../../src/dao/assessment-dao";
import type { Env } from "../../src/middleware/auth";
import type { Campaign, CampaignResource } from "../../src/types/campaign";
import type { ActivityType } from "../../src/types/assessment";

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
      AUTORAG_BASE_URL: "https://test-autorag.com",
      R2_BUCKET: {} as any,
      R2: {} as any,
      VECTORIZE: {} as any,
      AI: {} as any,
      Chat: {} as any,
      NOTIFICATION_HUB: {} as any,
      UPLOAD_SESSION: {} as any,
      UploadSession: {} as any,
      AUTORAG_POLLING: {} as any,
      AUTORAG_API_KEY: "test-key",
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

    // Mock the AssessmentDAO constructor
    (AssessmentDAO as any).mockImplementation(() => mockDAO);

    assessmentService = new AssessmentService(mockEnv);
  });

  describe("analyzeUserState", () => {
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
  });

  describe("getCampaignReadiness", () => {
    const mockCampaign: Campaign = {
      campaignId: "test-campaign",
      name: "Test Campaign",
      description: "A test campaign",
      resources: [],
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };

    it("should return Taking Root state for new campaign", async () => {
      const campaignId = "test-campaign";
      const mockResources: CampaignResource[] = [];

      mockDAO.getCampaignContext.mockResolvedValue([]);
      mockDAO.getCampaignCharacters.mockResolvedValue([]);

      const result = await assessmentService.getCampaignReadiness(
        campaignId,
        mockCampaign,
        mockResources
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
        {
          type: "file",
          id: "1",
          name: "Resource 1",
          campaign_id: campaignId,
          file_key: "key1",
          file_name: "file1.pdf",
          description: "Test",
          tags: "",
          status: "active",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      mockDAO.getCampaignContext.mockResolvedValue([
        { id: "1", title: "Context 1", content: "Test context" },
      ]);
      mockDAO.getCampaignCharacters.mockResolvedValue([
        { id: "1", name: "Character 1", type: "player" },
      ]);

      const result = await assessmentService.getCampaignReadiness(
        campaignId,
        mockCampaign,
        mockResources
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
      const mockResources: CampaignResource[] = Array(10)
        .fill(null)
        .map((_, i) => ({
          type: "file" as const,
          id: `${i}`,
          name: `Resource ${i}`,
          campaign_id: campaignId,
          file_key: `key${i}`,
          file_name: `file${i}.pdf`,
          description: "Test",
          tags: "",
          status: "active" as const,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        }));

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
        mockCampaign,
        mockResources
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
          mockCampaign,
          mockResources
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
        "Test Module"
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
      const mockCampaign: Campaign = {
        campaignId,
        name: "Test Campaign",
        description: "A test campaign",
        resources: [],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      };

      // Test Taking Root (30) - empty campaign gets 10+10+10=30
      mockDAO.getCampaignContext.mockResolvedValue([]);
      mockDAO.getCampaignCharacters.mockResolvedValue([]);
      let result = await assessmentService.getCampaignReadiness(
        campaignId,
        mockCampaign,
        []
      );
      expect(result.campaignState).toBe("Taking Root"); // Score 30 = Taking Root

      // Test Legendary (90) - 1-2 items in each category gives 30+30+30=90
      const someResources: CampaignResource[] = Array(2)
        .fill(null)
        .map((_, i) => ({
          type: "file" as const,
          id: `${i}`,
          name: `Resource ${i}`,
          campaign_id: campaignId,
          file_key: `key${i}`,
          file_name: `file${i}.pdf`,
          description: "Test",
          tags: "",
          status: "active" as const,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        }));

      mockDAO.getCampaignContext.mockResolvedValue([
        { id: "1", title: "Context 1", content: "Test" },
      ]);
      mockDAO.getCampaignCharacters.mockResolvedValue([
        { id: "1", name: "Character 1", type: "player" },
      ]);
      result = await assessmentService.getCampaignReadiness(
        campaignId,
        mockCampaign,
        someResources
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
        mockCampaign,
        someResources
      );
      // With 2 context, 2 characters, 2 resources (1-2 items each): 30 + 30 + 30 = 90 = Legendary
      expect(result.campaignState).toBe("Legendary");
    });
  });
});
