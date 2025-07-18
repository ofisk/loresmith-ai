import { getCurrentAgent } from "agents";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { campaignTools } from "../../src/tools/campaignTools";

// Mock the getCurrentAgent function
vi.mock("agents", () => ({
  getCurrentAgent: vi.fn(),
}));

// Mock the BaseAgent
vi.mock("../../src/agents/base-agent", () => ({
  BaseAgent: vi.fn(),
}));

describe("Campaign Durable Object Tools", () => {
  const mockEnv = {
    CampaignManager: {
      idFromName: vi.fn(),
      get: vi.fn(),
    },
  };

  const mockCampaignManager = {
    fetch: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    (getCurrentAgent as any).mockReturnValue({
      agent: { env: mockEnv },
    });

    mockEnv.CampaignManager.idFromName.mockReturnValue("mock-id");
    mockEnv.CampaignManager.get.mockReturnValue(mockCampaignManager);
  });

  describe("listCampaigns", () => {
    it("should list campaigns successfully", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          campaigns: [
            { campaignId: "campaign-1", name: "Test Campaign 1" },
            { campaignId: "campaign-2", name: "Test Campaign 2" },
          ],
        }),
      };

      mockCampaignManager.fetch.mockResolvedValue(mockResponse);

      const result = await campaignTools.listCampaigns.execute({}, {} as any);

      expect(mockEnv.CampaignManager.idFromName).toHaveBeenCalledWith(
        "default"
      );
      expect(mockEnv.CampaignManager.get).toHaveBeenCalledWith("mock-id");
      expect(mockCampaignManager.fetch).toHaveBeenCalledWith(
        "https://dummy/campaigns",
        {
          method: "GET",
        }
      );

      expect(result).toBe(
        "Found 2 campaign(s):\n- Test Campaign 1 (ID: campaign-1)\n- Test Campaign 2 (ID: campaign-2)"
      );
    });

    it("should handle empty campaigns list", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ campaigns: [] }),
      };

      mockCampaignManager.fetch.mockResolvedValue(mockResponse);

      const result = await campaignTools.listCampaigns.execute({}, {} as any);

      expect(result).toBe("No campaigns found.");
    });

    it("should handle errors", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
      };

      mockCampaignManager.fetch.mockResolvedValue(mockResponse);

      const result = await campaignTools.listCampaigns.execute({}, {} as any);

      expect(result).toBe(
        "Error listing campaigns: Failed to list campaigns: 500"
      );
    });
  });

  describe("createCampaign", () => {
    it("should create a campaign successfully", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          campaign: {
            campaignId: "new-campaign-123",
            name: "New Campaign",
          },
        }),
      };

      mockCampaignManager.fetch.mockResolvedValue(mockResponse);

      const result = await campaignTools.createCampaign.execute(
        {
          name: "New Campaign",
        },
        {} as any
      );

      expect(mockCampaignManager.fetch).toHaveBeenCalledWith(
        "https://dummy/campaigns",
        {
          method: "POST",
          body: JSON.stringify({ name: "New Campaign" }),
        }
      );

      expect(result).toBe(
        'Campaign "New Campaign" created successfully with ID: new-campaign-123'
      );
    });

    it("should handle creation errors", async () => {
      const mockResponse = {
        ok: false,
        status: 400,
      };

      mockCampaignManager.fetch.mockResolvedValue(mockResponse);

      const result = await campaignTools.createCampaign.execute(
        {
          name: "New Campaign",
        },
        {} as any
      );

      expect(result).toBe(
        "Error creating campaign: Failed to create campaign: 400"
      );
    });
  });

  describe("showCampaignDetails", () => {
    it("should show campaign details successfully", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          campaign: {
            campaignId: "campaign-123",
            name: "Test Campaign",
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-02T00:00:00Z",
            resources: [{ id: "resource-1", name: "Test Resource" }],
          },
        }),
      };

      mockCampaignManager.fetch.mockResolvedValue(mockResponse);

      const result = await campaignTools.showCampaignDetails.execute(
        {
          campaignId: "campaign-123",
        },
        {} as any
      );

      expect(mockCampaignManager.fetch).toHaveBeenCalledWith(
        "https://dummy/campaigns/campaign-123",
        {
          method: "GET",
        }
      );

      expect(result).toBe(
        "Campaign Details:\n- Name: Test Campaign\n- ID: campaign-123\n- Created: 2024-01-01T00:00:00Z\n- Updated: 2024-01-02T00:00:00Z\n- Resources: 1 items"
      );
    });

    it("should handle campaign not found", async () => {
      const mockResponse = {
        ok: false,
        status: 404,
      };

      mockCampaignManager.fetch.mockResolvedValue(mockResponse);

      const result = await campaignTools.showCampaignDetails.execute(
        {
          campaignId: "nonexistent",
        },
        {} as any
      );

      expect(result).toBe(
        "Error getting campaign details: Failed to get campaign details: 404"
      );
    });
  });

  describe("addResourceToCampaign", () => {
    it("should add resource to campaign successfully", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          resources: [
            { id: "resource-1", name: "Existing Resource" },
            { id: "resource-2", name: "New Resource" },
          ],
        }),
      };

      mockCampaignManager.fetch.mockResolvedValue(mockResponse);

      const result = await campaignTools.addResourceToCampaign.execute(
        {
          campaignId: "campaign-123",
          resourceType: "pdf",
          resourceId: "resource-2",
          resourceName: "New Resource",
        },
        {} as any
      );

      expect(mockCampaignManager.fetch).toHaveBeenCalledWith(
        "https://dummy/campaigns/campaign-123/resource",
        {
          method: "POST",
          body: JSON.stringify({
            type: "pdf",
            id: "resource-2",
            name: "New Resource",
          }),
        }
      );

      expect(result).toBe(
        'Resource "New Resource" (pdf) added successfully to campaign campaign-123. Total resources: 2'
      );
    });

    it("should handle resource addition errors", async () => {
      const mockResponse = {
        ok: false,
        status: 400,
      };

      mockCampaignManager.fetch.mockResolvedValue(mockResponse);

      const result = await campaignTools.addResourceToCampaign.execute(
        {
          campaignId: "campaign-123",
          resourceType: "pdf",
          resourceId: "resource-1",
          resourceName: "Test Resource",
        },
        {} as any
      );

      expect(result).toBe("Error adding resource: Failed to add resource: 400");
    });
  });

  describe("listCampaignResources", () => {
    it("should list campaign resources successfully", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          resources: [
            { id: "resource-1", name: "Resource 1", type: "pdf" },
            { id: "resource-2", name: "Resource 2", type: "image" },
          ],
        }),
      };

      mockCampaignManager.fetch.mockResolvedValue(mockResponse);

      const result = await campaignTools.listCampaignResources.execute(
        {
          campaignId: "campaign-123",
        },
        {} as any
      );

      expect(mockCampaignManager.fetch).toHaveBeenCalledWith(
        "https://dummy/campaigns/campaign-123/resources",
        {
          method: "GET",
        }
      );

      expect(result).toBe(
        "Found 2 resource(s) in campaign campaign-123:\n- Resource 1 (pdf)\n- Resource 2 (image)"
      );
    });

    it("should handle empty resources list", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ resources: [] }),
      };

      mockCampaignManager.fetch.mockResolvedValue(mockResponse);

      const result = await campaignTools.listCampaignResources.execute(
        {
          campaignId: "campaign-123",
        },
        {} as any
      );

      expect(result).toBe("No resources found in campaign campaign-123.");
    });
  });

  describe("deleteCampaign", () => {
    it("should delete campaign successfully", async () => {
      const mockResponse = {
        ok: true,
      };

      mockCampaignManager.fetch.mockResolvedValue(mockResponse);

      const result = await campaignTools.deleteCampaign.execute(
        {
          campaignId: "campaign-123",
        },
        {} as any
      );

      expect(mockCampaignManager.fetch).toHaveBeenCalledWith(
        "https://dummy/campaigns/campaign-123",
        {
          method: "DELETE",
        }
      );

      expect(result).toBe("Campaign campaign-123 deleted successfully.");
    });

    it("should handle deletion errors", async () => {
      const mockResponse = {
        ok: false,
        status: 404,
      };

      mockCampaignManager.fetch.mockResolvedValue(mockResponse);

      const result = await campaignTools.deleteCampaign.execute(
        {
          campaignId: "nonexistent",
        },
        {} as any
      );

      expect(result).toBe(
        "Error deleting campaign: Failed to delete campaign: 404"
      );
    });
  });

  describe("deleteCampaigns", () => {
    it("should delete multiple campaigns successfully", async () => {
      const mockResponse = {
        ok: true,
      };

      mockCampaignManager.fetch.mockResolvedValue(mockResponse);

      const result = await campaignTools.deleteCampaigns.execute(
        {
          campaignIds: ["campaign-1", "campaign-2"],
        },
        {} as any
      );

      expect(mockCampaignManager.fetch).toHaveBeenCalledWith(
        "https://dummy/campaigns",
        {
          method: "DELETE",
          body: JSON.stringify({ campaignIds: ["campaign-1", "campaign-2"] }),
        }
      );

      expect(result).toBe(
        "Successfully deleted 2 campaign(s): campaign-1, campaign-2"
      );
    });

    it("should handle deletion errors", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
      };

      mockCampaignManager.fetch.mockResolvedValue(mockResponse);

      const result = await campaignTools.deleteCampaigns.execute(
        {
          campaignIds: ["campaign-1"],
        },
        {} as any
      );

      expect(result).toBe(
        "Error deleting campaigns: Failed to delete campaigns: 500"
      );
    });
  });
});
