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
  AUTORAG_SEARCH_URL: "https://test-autorag.com/search",
  AUTORAG_API_URL: "https://test-autorag.com/api",
  AUTORAG_ACCOUNT_ID: "test-account",
  AUTORAG_API_TOKEN: "test-token",
  OPENAI_API_KEY: "test-openai-key",
  ADMIN_SECRET: "test-admin-secret",
  R2_ACCESS_KEY_ID: "test-r2-key",
  R2_SECRET_ACCESS_KEY: "test-r2-secret",
  R2_ACCOUNT_ID: "test-r2-account",
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
      mockEnv.AUTORAG_SEARCH_URL,
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

      // Verify that folder markers were created
      expect(mockExists).toHaveBeenCalledTimes(6); // 3 folders * 2 markers each
      expect(mockPut).toHaveBeenCalledTimes(6);

      // Verify the correct folder paths were checked
      expect(mockExists).toHaveBeenCalledWith(
        "campaigns/test-campaign-123/staging/.init"
      );
      expect(mockExists).toHaveBeenCalledWith(
        "campaigns/test-campaign-123/approved/.init"
      );
      expect(mockExists).toHaveBeenCalledWith(
        "campaigns/test-campaign-123/rejected/.init"
      );
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
        folder: "campaigns/test-campaign-123/rejected/",
      });
    });
  });
});
