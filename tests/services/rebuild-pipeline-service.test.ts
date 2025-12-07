import { beforeEach, describe, expect, it, vi } from "vitest";
import { RebuildPipelineService } from "@/services/graph/rebuild-pipeline-service";
import type { D1Database } from "@cloudflare/workers-types";

// Mock dependencies
vi.mock("@/services/graph/community-detection-service");
vi.mock("@/services/graph/entity-importance-service");
vi.mock("@/services/graph/rebuild-trigger-service");
vi.mock("@/dao/dao-factory");

describe("RebuildPipelineService", () => {
  let mockDb: D1Database;
  let mockRebuildStatusDAO: any;
  let mockEntityDAO: any;
  let mockCommunityDAO: any;
  let mockCommunitySummaryDAO: any;
  let mockEntityImportanceDAO: any;
  let mockCampaignDAO: any;
  let mockWorldStateChangelogDAO: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {} as D1Database;

    mockRebuildStatusDAO = {
      createRebuild: vi.fn(),
      updateRebuildStatus: vi.fn(),
      getRebuildById: vi.fn(),
    };

    mockEntityDAO = {};
    mockCommunityDAO = {};
    mockCommunitySummaryDAO = {};
    mockEntityImportanceDAO = {};
    mockCampaignDAO = {};
    mockWorldStateChangelogDAO = {
      listEntriesForCampaign: vi.fn().mockResolvedValue([]),
      markEntriesApplied: vi.fn(),
    };
  });

  describe("executeRebuild", () => {
    it("should execute a full rebuild", async () => {
      const service = new RebuildPipelineService(
        mockDb,
        mockRebuildStatusDAO,
        mockEntityDAO,
        mockCommunityDAO,
        mockCommunitySummaryDAO,
        mockEntityImportanceDAO,
        mockCampaignDAO,
        mockWorldStateChangelogDAO
      );

      // Mock the internal services
      const mockCommunityDetectionService = {
        rebuildCommunities: vi.fn().mockResolvedValue([]),
      };
      const mockEntityImportanceService = {
        recalculateImportanceForCampaign: vi.fn().mockResolvedValue(undefined),
      };
      const mockRebuildTriggerService = {
        resetImpact: vi.fn().mockResolvedValue(undefined),
      };

      // Use type assertion to access private members for testing
      (service as any).communityDetectionService =
        mockCommunityDetectionService;
      (service as any).entityImportanceService = mockEntityImportanceService;
      (service as any).rebuildTriggerService = mockRebuildTriggerService;

      mockRebuildStatusDAO.updateRebuildStatus.mockResolvedValue(undefined);
      mockRebuildStatusDAO.getRebuildById.mockResolvedValue({
        id: "rebuild-123",
        status: "pending",
      });

      const result = await service.executeRebuild(
        "rebuild-123",
        "campaign-123",
        "full"
      );

      expect(result).toBeDefined();
      expect(result.rebuildId).toBe("rebuild-123");
    });

    it("should handle rebuild failures gracefully", async () => {
      const service = new RebuildPipelineService(
        mockDb,
        mockRebuildStatusDAO,
        mockEntityDAO,
        mockCommunityDAO,
        mockCommunitySummaryDAO,
        mockEntityImportanceDAO,
        mockCampaignDAO,
        mockWorldStateChangelogDAO
      );

      mockRebuildStatusDAO.updateRebuildStatus.mockResolvedValue(undefined);

      const mockCommunityDetectionService = {
        rebuildCommunities: vi
          .fn()
          .mockRejectedValue(new Error("Rebuild failed")),
      };
      (service as any).communityDetectionService =
        mockCommunityDetectionService;

      const result = await service.executeRebuild(
        "rebuild-123",
        "campaign-123",
        "full"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
