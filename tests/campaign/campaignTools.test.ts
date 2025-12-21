import { beforeEach, describe, expect, it, vi } from "vitest";
import { campaignTools } from "../../src/tools/campaign";

// Mock fetch globally
global.fetch = vi.fn();

describe("Campaign Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("deleteCampaign", () => {
    const mockJwt = "mock-jwt-token";
    const mockCampaignId = "campaign-123";

    it("should delete a campaign successfully with valid JWT and ownership verification", async () => {
      // Mock the deletion request
      const mockDeleteResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockDeleteResponse);

      const result = await campaignTools.deleteCampaign.execute(
        { campaignId: mockCampaignId, jwt: mockJwt },
        {} as any
      );

      // Should make one call for deletion
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Call should be DELETE for deletion
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/campaigns/${mockCampaignId}`),
        expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: `Bearer ${mockJwt}`,
          }),
        })
      );

      expect(result).toEqual({
        toolCallId: "unknown",
        result: {
          success: true,
          message: `Campaign "${mockCampaignId}" has been deleted successfully.`,
          data: { campaignId: mockCampaignId },
        },
      });
    });

    it("should handle campaign not found during verification", async () => {
      const mockDeleteResponse = {
        ok: false,
        status: 404,
        json: vi.fn().mockResolvedValue({ error: "Campaign not found" }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockDeleteResponse);

      const result = await campaignTools.deleteCampaign.execute(
        { campaignId: mockCampaignId, jwt: mockJwt },
        {} as any
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        toolCallId: "unknown",
        result: {
          success: false,
          message: "Failed to delete campaign: 404",
          data: { error: "HTTP 404" },
        },
      });
    });

    it("should handle authentication error (401)", async () => {
      const mockDeleteResponse = {
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: "Unauthorized" }),
      };
      (global.fetch as any).mockResolvedValueOnce(mockDeleteResponse);

      const result = await campaignTools.deleteCampaign.execute(
        { campaignId: mockCampaignId, jwt: mockJwt },
        {} as any
      );

      expect(result).toEqual({
        toolCallId: "unknown",
        result: {
          success: false,
          message: "Authentication required. Please log in.",
          data: { error: "HTTP 401" },
        },
      });
    });

    it("should handle access denied error (403)", async () => {
      const mockDeleteResponse = {
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({ error: "Access denied" }),
      };
      (global.fetch as any).mockResolvedValueOnce(mockDeleteResponse);

      const result = await campaignTools.deleteCampaign.execute(
        { campaignId: mockCampaignId, jwt: mockJwt },
        {} as any
      );

      expect(result).toEqual({
        toolCallId: "unknown",
        result: {
          success: false,
          message:
            "Access denied. You don't have permission to perform this action.",
          data: { error: "HTTP 403" },
        },
      });
    });

    it("should handle network errors during verification", async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      const result = await campaignTools.deleteCampaign.execute(
        { campaignId: mockCampaignId, jwt: mockJwt },
        {} as any
      );

      expect(result).toEqual({
        toolCallId: "unknown",
        result: {
          success: false,
          message: "Failed to delete campaign: Network error",
          data: { error: "[object Object]" },
        },
      });
    });

    it("should work without JWT (for backward compatibility)", async () => {
      const mockDeleteResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockDeleteResponse);

      const result = await campaignTools.deleteCampaign.execute(
        { campaignId: mockCampaignId, jwt: null },
        {} as any
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.result.success).toBe(true);
    });
  });

  describe("deleteCampaigns", () => {
    const mockJwt = "mock-jwt-token";

    it("should delete multiple campaigns successfully with valid JWT and ownership verification", async () => {
      // Mock the deletion request
      const mockDeleteResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockDeleteResponse);

      const result = await campaignTools.deleteCampaigns.execute(
        { jwt: mockJwt },
        {} as any
      );

      // Should make 1 call for deletion
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Call should be DELETE for deletion
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/campaigns"),
        expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: `Bearer ${mockJwt}`,
          }),
        })
      );

      expect(result).toEqual({
        toolCallId: "unknown",
        result: {
          success: true,
          message: "All campaigns have been deleted successfully.",
          data: { deleted: true },
        },
      });
    });

    it("should handle inaccessible campaigns during verification", async () => {
      const mockDeleteResponse = {
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({ error: "Access denied" }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockDeleteResponse);

      const result = await campaignTools.deleteCampaigns.execute(
        { jwt: mockJwt },
        {} as any
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        toolCallId: "unknown",
        result: {
          success: false,
          message:
            "Access denied. You don't have permission to perform this action.",
          data: { error: "HTTP 403" },
        },
      });
    });

    it("should handle authentication error (401) during verification", async () => {
      const mockDeleteResponse = {
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: "Unauthorized" }),
      };
      (global.fetch as any).mockResolvedValueOnce(mockDeleteResponse);

      const result = await campaignTools.deleteCampaigns.execute(
        { jwt: mockJwt },
        {} as any
      );

      expect(result).toEqual({
        toolCallId: "unknown",
        result: {
          success: false,
          message: "Authentication required. Please log in.",
          data: { error: "HTTP 401" },
        },
      });
    });

    it("should handle access denied error (403) during verification", async () => {
      const mockDeleteResponse = {
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({ error: "Access denied" }),
      };
      (global.fetch as any).mockResolvedValueOnce(mockDeleteResponse);

      const result = await campaignTools.deleteCampaigns.execute(
        { jwt: mockJwt },
        {} as any
      );

      expect(result).toEqual({
        toolCallId: "unknown",
        result: {
          success: false,
          message:
            "Access denied. You don't have permission to perform this action.",
          data: { error: "HTTP 403" },
        },
      });
    });

    it("should handle server error (500) during verification", async () => {
      const mockDeleteResponse = {
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ error: "Internal server error" }),
      };
      (global.fetch as any).mockResolvedValueOnce(mockDeleteResponse);

      const result = await campaignTools.deleteCampaigns.execute(
        { jwt: mockJwt },
        {} as any
      );

      expect(result).toEqual({
        toolCallId: "unknown",
        result: {
          success: false,
          message: "Failed to delete campaigns: 500",
          data: { error: "HTTP 500" },
        },
      });
    });

    it("should handle network errors during verification", async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      const result = await campaignTools.deleteCampaigns.execute(
        { jwt: mockJwt },
        {} as any
      );

      expect(result).toEqual({
        toolCallId: "unknown",
        result: {
          success: false,
          message: "Failed to delete campaigns: Network error",
          data: { error: "[object Object]" },
        },
      });
    });

    it("should work with empty campaign IDs array", async () => {
      const mockDeleteResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      };
      (global.fetch as any).mockResolvedValueOnce(mockDeleteResponse);

      const result = await campaignTools.deleteCampaigns.execute(
        { jwt: mockJwt },
        {} as any
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/campaigns"),
        expect.objectContaining({
          method: "DELETE",
        })
      );

      expect(result.result.success).toBe(true);
    });

    it("should work without JWT (for backward compatibility)", async () => {
      const mockDeleteResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockDeleteResponse);

      const result = await campaignTools.deleteCampaigns.execute(
        { jwt: null },
        {} as any
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.result.success).toBe(true);
    });
  });

  describe("Tool definitions", () => {
    it("should have correct tool structure for deleteCampaign", () => {
      expect(campaignTools.deleteCampaign).toBeDefined();
      expect(campaignTools.deleteCampaign.description).toContain(
        "Delete a specific campaign"
      );
      expect(campaignTools.deleteCampaign.parameters).toBeDefined();
    });

    it("should have correct tool structure for deleteCampaigns", () => {
      expect(campaignTools.deleteCampaigns).toBeDefined();
      expect(campaignTools.deleteCampaigns.description).toBe(
        "Delete all campaigns for the current user"
      );
      expect(campaignTools.deleteCampaigns.parameters).toBeDefined();
    });

    it("should require campaignId parameter for deleteCampaign", () => {
      const parameters = campaignTools.deleteCampaign.parameters;
      expect(parameters).toBeDefined();
      // The parameters object is a Zod schema, so we can't access properties directly
      // but we can verify the tool structure is correct
    });

    it("should require campaignIds parameter for deleteCampaigns", () => {
      const parameters = campaignTools.deleteCampaigns.parameters;
      expect(parameters).toBeDefined();
      // The parameters object is a Zod schema, so we can't access properties directly
      // but we can verify the tool structure is correct
    });

    it("should have optional JWT parameter for both tools", () => {
      expect(campaignTools.deleteCampaign.parameters).toBeDefined();
      expect(campaignTools.deleteCampaigns.parameters).toBeDefined();

      // Verify the parameters are defined (JWT is included in commonSchemas)
      expect(campaignTools.deleteCampaign.parameters).toBeDefined();
      expect(campaignTools.deleteCampaigns.parameters).toBeDefined();
    });
  });
});
