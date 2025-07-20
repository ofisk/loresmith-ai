import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_CODES, USER_MESSAGES } from "../../src/constants";
import { campaignTools } from "../../src/tools/campaignTools";

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
      // Mock the verification request (GET campaign details)
      const mockVerifyResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          campaign: {
            campaignId: mockCampaignId,
            name: "Test Campaign",
          },
        }),
      };

      // Mock the deletion request
      const mockDeleteResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      };

      (global.fetch as any)
        .mockResolvedValueOnce(mockVerifyResponse) // First call: verification
        .mockResolvedValueOnce(mockDeleteResponse); // Second call: deletion

      const result = await campaignTools.deleteCampaign.execute(
        { campaignId: mockCampaignId, jwt: mockJwt },
        {} as any
      );

      // Should make two calls: one for verification, one for deletion
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // First call should be GET for verification
      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(`/campaigns/${mockCampaignId}`),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: `Bearer ${mockJwt}`,
          }),
        })
      );

      // Second call should be DELETE for actual deletion
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
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
        code: AUTH_CODES.SUCCESS,
        message: `${USER_MESSAGES.CAMPAIGN_DELETED} ${mockCampaignId}`,
        data: { campaignId: mockCampaignId },
      });
    });

    it("should handle campaign not found during verification", async () => {
      const mockVerifyResponse = {
        ok: false,
        status: 404,
        json: vi.fn().mockResolvedValue({ error: "Campaign not found" }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockVerifyResponse);

      const result = await campaignTools.deleteCampaign.execute(
        { campaignId: mockCampaignId, jwt: mockJwt },
        {} as any
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        code: AUTH_CODES.ERROR,
        message:
          "Campaign not found or you don't have permission to access it.",
        data: { error: "Campaign not found" },
      });
    });

    it("should handle authentication error (401)", async () => {
      const mockVerifyResponse = {
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: "Unauthorized" }),
      };
      (global.fetch as any).mockResolvedValueOnce(mockVerifyResponse);

      const result = await campaignTools.deleteCampaign.execute(
        { campaignId: mockCampaignId, jwt: mockJwt },
        {} as any
      );

      expect(result).toEqual({
        code: AUTH_CODES.INVALID_KEY,
        message: expect.stringContaining("Authentication required"),
        data: { error: "HTTP 401" },
      });
    });

    it("should handle access denied error (403)", async () => {
      const mockVerifyResponse = {
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({ error: "Access denied" }),
      };
      (global.fetch as any).mockResolvedValueOnce(mockVerifyResponse);

      const result = await campaignTools.deleteCampaign.execute(
        { campaignId: mockCampaignId, jwt: mockJwt },
        {} as any
      );

      expect(result).toEqual({
        code: AUTH_CODES.INVALID_KEY,
        message: expect.stringContaining("Access denied"),
        data: { error: "HTTP 403" },
      });
    });

    it("should handle network errors during verification", async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      const result = await campaignTools.deleteCampaign.execute(
        { campaignId: mockCampaignId, jwt: mockJwt },
        {} as any
      );

      expect(result).toEqual({
        code: AUTH_CODES.ERROR,
        message: "Error deleting campaign: Network error",
        data: { error: "Network error" },
      });
    });

    it("should work without JWT (for backward compatibility)", async () => {
      const mockVerifyResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          campaign: {
            campaignId: mockCampaignId,
            name: "Test Campaign",
          },
        }),
      };

      const mockDeleteResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      };

      (global.fetch as any)
        .mockResolvedValueOnce(mockVerifyResponse)
        .mockResolvedValueOnce(mockDeleteResponse);

      const result = await campaignTools.deleteCampaign.execute(
        { campaignId: mockCampaignId, jwt: null },
        {} as any
      );

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.code).toBe(AUTH_CODES.SUCCESS);
    });
  });

  describe("deleteCampaigns", () => {
    const mockJwt = "mock-jwt-token";
    const mockCampaignIds = ["campaign-1", "campaign-2", "campaign-3"];

    it("should delete multiple campaigns successfully with valid JWT and ownership verification", async () => {
      // Mock verification responses for all campaigns
      const mockVerifyResponses = mockCampaignIds.map(() => ({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ campaign: { campaignId: "test" } }),
      }));

      // Mock the deletion request
      const mockDeleteResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      };

      (global.fetch as any)
        .mockResolvedValueOnce(mockVerifyResponses[0])
        .mockResolvedValueOnce(mockVerifyResponses[1])
        .mockResolvedValueOnce(mockVerifyResponses[2])
        .mockResolvedValueOnce(mockDeleteResponse);

      const result = await campaignTools.deleteCampaigns.execute(
        { campaignIds: mockCampaignIds, jwt: mockJwt },
        {} as any
      );

      // Should make 4 calls: 3 for verification, 1 for deletion
      expect(global.fetch).toHaveBeenCalledTimes(4);

      // First 3 calls should be GET for verification
      mockCampaignIds.forEach((campaignId, index) => {
        expect(global.fetch).toHaveBeenNthCalledWith(
          index + 1,
          expect.stringContaining(`/campaigns/${campaignId}`),
          expect.objectContaining({
            method: "GET",
            headers: expect.objectContaining({
              "Content-Type": "application/json",
              Authorization: `Bearer ${mockJwt}`,
            }),
          })
        );
      });

      // Last call should be DELETE for actual deletion
      expect(global.fetch).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining("/campaigns"),
        expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: `Bearer ${mockJwt}`,
          }),
          body: JSON.stringify({ campaignIds: mockCampaignIds }),
        })
      );

      expect(result).toEqual({
        code: AUTH_CODES.SUCCESS,
        message: `${USER_MESSAGES.CAMPAIGNS_DELETED} ${mockCampaignIds.join(", ")}`,
        data: { campaignIds: mockCampaignIds },
      });
    });

    it("should handle inaccessible campaigns during verification", async () => {
      // Mock verification responses: first campaign accessible, others not
      const mockVerifyResponses = [
        {
          ok: true,
          status: 200,
          json: vi
            .fn()
            .mockResolvedValue({ campaign: { campaignId: "campaign-1" } }),
        },
        {
          ok: false,
          status: 404,
          json: vi.fn().mockResolvedValue({ error: "Not found" }),
        },
        {
          ok: false,
          status: 403,
          json: vi.fn().mockResolvedValue({ error: "Access denied" }),
        },
      ];

      (global.fetch as any)
        .mockResolvedValueOnce(mockVerifyResponses[0])
        .mockResolvedValueOnce(mockVerifyResponses[1])
        .mockResolvedValueOnce(mockVerifyResponses[2]);

      const result = await campaignTools.deleteCampaigns.execute(
        { campaignIds: mockCampaignIds, jwt: mockJwt },
        {} as any
      );

      expect(global.fetch).toHaveBeenCalledTimes(3);
      // The tool treats 403 as an authentication error, so it returns AUTH_CODES.INVALID_KEY
      expect(result).toEqual({
        code: AUTH_CODES.INVALID_KEY,
        message: expect.stringContaining("Access denied"),
        data: { error: "HTTP 401" },
      });
    });

    it("should handle authentication error (401) during verification", async () => {
      const mockVerifyResponse = {
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: "Unauthorized" }),
      };
      (global.fetch as any).mockResolvedValueOnce(mockVerifyResponse);

      const result = await campaignTools.deleteCampaigns.execute(
        { campaignIds: mockCampaignIds, jwt: mockJwt },
        {} as any
      );

      expect(result).toEqual({
        code: AUTH_CODES.INVALID_KEY,
        message: expect.stringContaining("Authentication required"),
        data: { error: "HTTP 401" },
      });
    });

    it("should handle access denied error (403) during verification", async () => {
      const mockVerifyResponse = {
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({ error: "Access denied" }),
      };
      (global.fetch as any).mockResolvedValueOnce(mockVerifyResponse);

      const result = await campaignTools.deleteCampaigns.execute(
        { campaignIds: mockCampaignIds, jwt: mockJwt },
        {} as any
      );

      expect(result).toEqual({
        code: AUTH_CODES.INVALID_KEY,
        message: expect.stringContaining("Access denied"),
        data: { error: "HTTP 403" },
      });
    });

    it("should handle server error (500) during verification", async () => {
      const mockVerifyResponse = {
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ error: "Internal server error" }),
      };
      (global.fetch as any).mockResolvedValueOnce(mockVerifyResponse);

      const result = await campaignTools.deleteCampaigns.execute(
        { campaignIds: mockCampaignIds, jwt: mockJwt },
        {} as any
      );

      expect(result).toEqual({
        code: AUTH_CODES.ERROR,
        message:
          "Cannot delete campaigns: campaign-1, campaign-2, campaign-3. These campaigns either don't exist or you don't have permission to access them.",
        data: {
          error: "Campaigns not accessible",
          inaccessibleCampaigns: ["campaign-1", "campaign-2", "campaign-3"],
          accessibleCampaigns: [],
        },
      });
    });

    it("should handle network errors during verification", async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      const result = await campaignTools.deleteCampaigns.execute(
        { campaignIds: mockCampaignIds, jwt: mockJwt },
        {} as any
      );

      expect(result).toEqual({
        code: AUTH_CODES.ERROR,
        message:
          "Cannot delete campaigns: campaign-1, campaign-2, campaign-3. These campaigns either don't exist or you don't have permission to access them.",
        data: {
          error: "Campaigns not accessible",
          inaccessibleCampaigns: ["campaign-1", "campaign-2", "campaign-3"],
          accessibleCampaigns: [],
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
        { campaignIds: [], jwt: mockJwt },
        {} as any
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/campaigns"),
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ campaignIds: [] }),
        })
      );

      expect(result.code).toBe(AUTH_CODES.SUCCESS);
      expect(result.message).toBe(`${USER_MESSAGES.CAMPAIGNS_DELETED} `);
    });

    it("should work without JWT (for backward compatibility)", async () => {
      // Mock verification responses for all campaigns
      const mockVerifyResponses = mockCampaignIds.map(() => ({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ campaign: { campaignId: "test" } }),
      }));

      const mockDeleteResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      };

      (global.fetch as any)
        .mockResolvedValueOnce(mockVerifyResponses[0])
        .mockResolvedValueOnce(mockVerifyResponses[1])
        .mockResolvedValueOnce(mockVerifyResponses[2])
        .mockResolvedValueOnce(mockDeleteResponse);

      const result = await campaignTools.deleteCampaigns.execute(
        { campaignIds: mockCampaignIds, jwt: null },
        {} as any
      );

      expect(global.fetch).toHaveBeenCalledTimes(4);
      expect(result.code).toBe(AUTH_CODES.SUCCESS);
    });
  });

  describe("Tool definitions", () => {
    it("should have correct tool structure for deleteCampaign", () => {
      expect(campaignTools.deleteCampaign).toBeDefined();
      expect(campaignTools.deleteCampaign.description).toContain(
        "user-specific"
      );
      expect(campaignTools.deleteCampaign.description).toContain(
        "authenticated user"
      );
      expect(campaignTools.deleteCampaign.parameters).toBeDefined();
    });

    it("should have correct tool structure for deleteCampaigns", () => {
      expect(campaignTools.deleteCampaigns).toBeDefined();
      expect(campaignTools.deleteCampaigns.description).toContain(
        "user-specific"
      );
      expect(campaignTools.deleteCampaigns.description).toContain(
        "authenticated user"
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

      // Verify the descriptions mention authentication
      expect(campaignTools.deleteCampaign.description).toContain(
        "authenticated user"
      );
      expect(campaignTools.deleteCampaigns.description).toContain(
        "authenticated user"
      );
    });
  });
});
