import { describe, it, expect } from "vitest";
import {
  validateShardGenerationResource,
  getAutoRAGSearchPath,
  validateSearchPath,
  normalizeResourceForShardGeneration,
  logShardGenerationContext,
  validateShardGenerationOptions,
  type ShardGenerationResource,
} from "../../src/lib/shard-generation-utils";

describe("ShardGenerationUtils", () => {
  describe("validateShardGenerationResource", () => {
    it("should validate a correct resource", () => {
      const resource = {
        id: "resource-123",
        file_key: "staging/ofisk/test.pdf",
        file_name: "test.pdf",
        campaign_id: "campaign-456",
      };

      const result = validateShardGenerationResource(resource);
      expect(result).toEqual(resource);
    });

    it("should throw error for missing resource", () => {
      expect(() => validateShardGenerationResource(null)).toThrow(
        "Resource is required"
      );
      expect(() => validateShardGenerationResource(undefined)).toThrow(
        "Resource is required"
      );
    });

    it("should throw error for missing id", () => {
      const resource = {
        file_key: "staging/ofisk/test.pdf",
        file_name: "test.pdf",
      };

      expect(() => validateShardGenerationResource(resource)).toThrow(
        "Resource ID is required"
      );
    });

    it("should throw error for missing file_key", () => {
      const resource = {
        id: "resource-123",
        file_name: "test.pdf",
      };

      expect(() => validateShardGenerationResource(resource)).toThrow(
        "Resource file_key is required"
      );
    });

    it("should throw error for missing file_name", () => {
      const resource = {
        id: "resource-123",
        file_key: "staging/ofisk/test.pdf",
      };

      expect(() => validateShardGenerationResource(resource)).toThrow(
        "Resource file_name is required"
      );
    });
  });

  describe("getAutoRAGSearchPath", () => {
    it("should return the file_key path", () => {
      const resource: ShardGenerationResource = {
        id: "resource-123",
        file_key: "staging/ofisk/test.pdf",
        file_name: "test.pdf",
        campaign_id: "campaign-456",
      };

      const result = getAutoRAGSearchPath(resource);
      expect(result).toBe("staging/ofisk/");
    });

    it("should handle complex paths", () => {
      const resource: ShardGenerationResource = {
        id: "resource-123",
        file_key: "campaigns/abc-123/staging/user/file with spaces.pdf",
        file_name: "file with spaces.pdf",
        campaign_id: "campaign-456",
      };

      const result = getAutoRAGSearchPath(resource);
      expect(result).toBe("campaigns/abc-123/staging/user/");
    });
  });

  describe("validateSearchPath", () => {
    it("should validate correct paths", () => {
      expect(() => validateSearchPath("staging/ofisk/test.pdf")).not.toThrow();
      expect(() =>
        validateSearchPath("campaigns/abc-123/staging/file.pdf")
      ).not.toThrow();
    });

    it("should throw error for empty path", () => {
      expect(() => validateSearchPath("")).toThrow(
        "Search path cannot be empty"
      );
      expect(() => validateSearchPath("   ")).toThrow(
        "Search path cannot be empty"
      );
    });

    it("should throw error for too short path", () => {
      expect(() => validateSearchPath("ab")).toThrow("Search path too short");
    });

    it("should throw error for paths with undefined/null", () => {
      expect(() => validateSearchPath("staging/undefined/file.pdf")).toThrow(
        "contains undefined/null"
      );
      expect(() => validateSearchPath("staging/null/file.pdf")).toThrow(
        "contains undefined/null"
      );
    });

    it("should warn about UUID-like paths", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      validateSearchPath("f65f441b-ad3a-4af8-a755-8f4018f1b0d8");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Search path looks like a UUID")
      );

      consoleSpy.mockRestore();
    });

    it("should warn about paths without separators", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      validateSearchPath("test.pdf");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Search path has no path separators")
      );

      consoleSpy.mockRestore();
    });
  });

  describe("normalizeResourceForShardGeneration", () => {
    it("should handle standard resource format", () => {
      const resource = {
        id: "resource-123",
        file_key: "staging/ofisk/test.pdf",
        file_name: "test.pdf",
        campaign_id: "campaign-456",
      };

      const result = normalizeResourceForShardGeneration(resource);
      expect(result).toEqual(resource);
    });

    it("should handle camelCase field names", () => {
      const resource = {
        id: "resource-123",
        fileKey: "staging/ofisk/test.pdf",
        fileName: "test.pdf",
        campaignId: "campaign-456",
      };

      const result = normalizeResourceForShardGeneration(resource);
      expect(result).toEqual({
        id: "resource-123",
        file_key: "staging/ofisk/test.pdf",
        file_name: "test.pdf",
        campaign_id: "campaign-456",
      });
    });

    it("should handle mixed field names", () => {
      const resource = {
        id: "resource-123",
        fileKey: "staging/ofisk/test.pdf", // camelCase
        file_name: "test.pdf", // snake_case
        campaignId: "campaign-456", // camelCase
      };

      const result = normalizeResourceForShardGeneration(resource);
      expect(result).toEqual({
        id: "resource-123",
        file_key: "staging/ofisk/test.pdf",
        file_name: "test.pdf",
        campaign_id: "campaign-456",
      });
    });

    it("should fallback to id if file_key is missing", () => {
      const resource = {
        id: "staging/ofisk/test.pdf", // This is actually the file path
        file_name: "test.pdf",
        campaign_id: "campaign-456",
      };

      const result = normalizeResourceForShardGeneration(resource);
      expect(result.file_key).toBe("staging/ofisk/test.pdf");
    });

    it("should throw error if required fields are missing", () => {
      const resource = {
        // Missing id
        file_name: "test.pdf",
      };

      expect(() => normalizeResourceForShardGeneration(resource)).toThrow(
        "Resource ID is required"
      );
    });
  });

  describe("logShardGenerationContext", () => {
    it("should log context information", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const resource: ShardGenerationResource = {
        id: "resource-123",
        file_key: "staging/ofisk/test.pdf",
        file_name: "test.pdf",
        campaign_id: "campaign-456",
      };

      logShardGenerationContext(
        resource,
        "staging/ofisk/test.pdf",
        "campaign-456"
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        "[ShardGeneration] Context:",
        expect.objectContaining({
          resourceId: "resource-123",
          fileKey: "staging/ofisk/test.pdf",
          fileName: "test.pdf",
          searchPath: "staging/ofisk/test.pdf",
          campaignId: "campaign-456",
          pathMatches: true,
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe("validateShardGenerationOptions", () => {
    it("should validate correct options", () => {
      const options = {
        env: {},
        username: "testuser",
        campaignId: "campaign-123",
        campaignName: "Test Campaign",
        resource: { id: "resource-123" },
        campaignRagBasePath: "campaigns/campaign-123",
      };

      expect(() => validateShardGenerationOptions(options)).not.toThrow();
    });

    it("should throw error for missing env", () => {
      const options = {
        username: "testuser",
        campaignId: "campaign-123",
        campaignName: "Test Campaign",
        resource: { id: "resource-123" },
        campaignRagBasePath: "campaigns/campaign-123",
      };

      expect(() => validateShardGenerationOptions(options as any)).toThrow(
        "Environment is required"
      );
    });

    it("should throw error for missing username", () => {
      const options = {
        env: {},
        campaignId: "campaign-123",
        campaignName: "Test Campaign",
        resource: { id: "resource-123" },
        campaignRagBasePath: "campaigns/campaign-123",
      };

      expect(() => validateShardGenerationOptions(options as any)).toThrow(
        "Username is required"
      );
    });

    it("should throw error for missing campaignId", () => {
      const options = {
        env: {},
        username: "testuser",
        campaignName: "Test Campaign",
        resource: { id: "resource-123" },
        campaignRagBasePath: "campaigns/campaign-123",
      };

      expect(() => validateShardGenerationOptions(options as any)).toThrow(
        "Campaign ID is required"
      );
    });

    it("should throw error for missing campaignName", () => {
      const options = {
        env: {},
        username: "testuser",
        campaignId: "campaign-123",
        resource: { id: "resource-123" },
        campaignRagBasePath: "campaigns/campaign-123",
      };

      expect(() => validateShardGenerationOptions(options as any)).toThrow(
        "Campaign name is required"
      );
    });

    it("should throw error for missing resource", () => {
      const options = {
        env: {},
        username: "testuser",
        campaignId: "campaign-123",
        campaignName: "Test Campaign",
        campaignRagBasePath: "campaigns/campaign-123",
      };

      expect(() => validateShardGenerationOptions(options as any)).toThrow(
        "Resource is required"
      );
    });

    it("should throw error for missing campaignRagBasePath", () => {
      const options = {
        env: {},
        username: "testuser",
        campaignId: "campaign-123",
        campaignName: "Test Campaign",
        resource: { id: "resource-123" },
      };

      expect(() => validateShardGenerationOptions(options as any)).toThrow(
        "Campaign RAG base path is required"
      );
    });
  });
});
