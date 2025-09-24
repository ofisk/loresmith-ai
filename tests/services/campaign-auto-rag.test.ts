import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/middleware/auth";
import { CampaignAutoRAG } from "../../src/services/campaign-autorag-service";

// Mock environment
const mockEnv: Env = {
  R2: {
    put: vi.fn(),
    get: vi.fn(),
    head: vi.fn(),
    delete: vi.fn(),
  } as any,
  DB: {} as any,
  VECTORIZE: {} as any,
  AI: {} as any,
  AUTORAG_BASE_URL: "https://test-autorag.com",
  AUTORAG_API_TOKEN: "test-token",
  OPENAI_API_KEY: "test-openai-key",
  ADMIN_SECRET: "test-admin-secret",
  Chat: {} as any,
  UserFileTracker: {} as any,
  UploadSession: {} as any,
  ASSETS: {} as any,
  FILE_PROCESSING_QUEUE: {} as any,
  FILE_PROCESSING_DLQ: {} as any,
};

describe("CampaignAutoRAG", () => {
  let campaignAutoRAG: CampaignAutoRAG;

  beforeEach(() => {
    vi.clearAllMocks();
    campaignAutoRAG = new CampaignAutoRAG(
      mockEnv,
      mockEnv.AUTORAG_BASE_URL as string,
      "campaigns/test-campaign-123"
    );
  });

  describe("enforcedFilter", () => {
    it("should return the correct approved folder path", () => {
      // Access the protected method through the class instance
      const result = (campaignAutoRAG as any).enforcedFilter();
      expect(result).toBe("campaigns/test-campaign-123/approved/");
    });
  });

  describe("getCampaignRagBasePath", () => {
    it("should return the campaign RAG base path", () => {
      const result = campaignAutoRAG.getCampaignRagBasePath();
      expect(result).toBe("campaigns/test-campaign-123");
    });
  });

  describe("initFolders", () => {
    it("should create folder markers", async () => {
      // Mock R2Helper methods
      const mockExists = vi.fn().mockResolvedValue(false);
      const mockPut = vi.fn().mockResolvedValue(undefined);

      // Mock the R2Helper instance
      (campaignAutoRAG as any).r2Helper = {
        exists: mockExists,
        put: mockPut,
      };

      await campaignAutoRAG.initFolders();

      // No marker files are created anymore - folders are created automatically when files are uploaded
      expect(mockExists).toHaveBeenCalledTimes(0);
      expect(mockPut).toHaveBeenCalledTimes(0);
    });
  });

  describe("searchRejected", () => {
    it("should search with rejected folder filter", async () => {
      const mockSearch = vi.fn().mockResolvedValue({
        results: [],
        total: 0,
      });

      // Mock the AutoRAGClient
      (campaignAutoRAG as any).autoRagClient = {
        search: mockSearch,
      };

      await campaignAutoRAG.searchRejected("test query", { limit: 5 });

      expect(mockSearch).toHaveBeenCalledWith("test query", {
        limit: 5,
        filters: {
          type: "and",
          filters: [
            {
              type: "eq",
              key: "folder",
              value: "campaigns/test-campaign-123/rejected/",
            },
          ],
        },
      });
    });
  });
});
