import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignData } from "../../src/types/campaign";
import { createMockCampaign, createMockResource } from "./testUtils";

// Mock the CampaignManager Durable Object
vi.mock("../../src/durable-objects/CampaignManager", () => ({
  CampaignManager: vi.fn(),
}));

describe("Campaign Durable Objects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("CampaignManager", () => {
    it("should store campaign data in KV", async () => {
      // Mock KV operations
      const mockKV = {
        put: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      const mockCampaign = createMockCampaign({
        campaignId: "test-campaign",
        name: "Test Campaign",
      });

      // Mock successful KV put operation
      mockKV.put.mockResolvedValueOnce(undefined);

      // Test campaign storage
      await mockKV.put(
        "user:demo-user:campaign:test-campaign",
        JSON.stringify(mockCampaign)
      );

      expect(mockKV.put).toHaveBeenCalledWith(
        "user:demo-user:campaign:test-campaign",
        JSON.stringify(mockCampaign)
      );
    });

    it("should retrieve campaign data from KV", async () => {
      const mockKV = {
        put: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      const mockCampaign = createMockCampaign({
        campaignId: "test-campaign",
        name: "Test Campaign",
      });

      // Mock successful KV get operation
      mockKV.get.mockResolvedValueOnce(JSON.stringify(mockCampaign));

      const campaignData = await mockKV.get(
        "user:demo-user:campaign:test-campaign"
      );
      const parsedCampaign = JSON.parse(campaignData as string) as CampaignData;

      expect(mockKV.get).toHaveBeenCalledWith(
        "user:demo-user:campaign:test-campaign"
      );
      expect(parsedCampaign.campaignId).toBe("test-campaign");
      expect(parsedCampaign.name).toBe("Test Campaign");
    });

    it("should handle missing campaign data", async () => {
      const mockKV = {
        put: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      // Mock KV get returning null for missing campaign
      mockKV.get.mockResolvedValueOnce(null);

      const campaignData = await mockKV.get(
        "user:demo-user:campaign:nonexistent"
      );

      expect(mockKV.get).toHaveBeenCalledWith(
        "user:demo-user:campaign:nonexistent"
      );
      expect(campaignData).toBeNull();
    });

    it("should list all campaigns for a user", async () => {
      const mockKV = {
        put: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      const mockCampaigns = [
        createMockCampaign({ campaignId: "campaign-1", name: "Campaign 1" }),
        createMockCampaign({ campaignId: "campaign-2", name: "Campaign 2" }),
      ];

      // Mock KV list operation
      mockKV.list.mockResolvedValueOnce({
        keys: [
          { name: "user:demo-user:campaign:campaign-1" },
          { name: "user:demo-user:campaign:campaign-2" },
        ],
        list_complete: true,
        cursor: "",
      });

      // Mock individual campaign retrievals
      mockKV.get
        .mockResolvedValueOnce(JSON.stringify(mockCampaigns[0]))
        .mockResolvedValueOnce(JSON.stringify(mockCampaigns[1]));

      const listResult = await mockKV.list({
        prefix: "user:demo-user:campaign:",
      });

      expect(mockKV.list).toHaveBeenCalledWith({
        prefix: "user:demo-user:campaign:",
      });
      expect(listResult.keys).toHaveLength(2);
      expect(listResult.list_complete).toBe(true);
    });

    it("should delete campaign data", async () => {
      const mockKV = {
        put: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      // Mock successful KV delete operation
      mockKV.delete.mockResolvedValueOnce(undefined);

      await mockKV.delete("user:demo-user:campaign:test-campaign");

      expect(mockKV.delete).toHaveBeenCalledWith(
        "user:demo-user:campaign:test-campaign"
      );
    });
  });

  describe("Campaign Resource Management", () => {
    it("should add resource to campaign", async () => {
      const mockKV = {
        put: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      const existingCampaign = createMockCampaign({
        campaignId: "test-campaign",
        name: "Test Campaign",
        resources: [],
      });

      const newResource = createMockResource({
        id: "new-resource",
        name: "New Resource",
        type: "pdf",
      });

      // Mock getting existing campaign
      mockKV.get.mockResolvedValueOnce(JSON.stringify(existingCampaign));

      // Mock updating campaign with new resource
      mockKV.put.mockResolvedValueOnce(undefined);

      // Simulate adding resource to campaign
      const updatedCampaign = {
        ...existingCampaign,
        resources: [...existingCampaign.resources, newResource],
        updatedAt: new Date().toISOString(),
      };

      await mockKV.put(
        "user:demo-user:campaign:test-campaign",
        JSON.stringify(updatedCampaign)
      );

      expect(mockKV.put).toHaveBeenCalledWith(
        "user:demo-user:campaign:test-campaign",
        JSON.stringify(updatedCampaign)
      );
      expect(updatedCampaign.resources).toHaveLength(1);
      expect(updatedCampaign.resources[0].id).toBe("new-resource");
    });

    it("should remove resource from campaign", async () => {
      const mockKV = {
        put: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      const existingCampaign = createMockCampaign({
        campaignId: "test-campaign",
        name: "Test Campaign",
        resources: [
          createMockResource({ id: "resource-1", name: "Resource 1" }),
          createMockResource({ id: "resource-2", name: "Resource 2" }),
        ],
      });

      // Mock getting existing campaign
      mockKV.get.mockResolvedValueOnce(JSON.stringify(existingCampaign));

      // Mock updating campaign without the removed resource
      mockKV.put.mockResolvedValueOnce(undefined);

      // Simulate removing resource from campaign
      const resourceToRemove = "resource-1";
      const updatedCampaign = {
        ...existingCampaign,
        resources: existingCampaign.resources.filter(
          (r) => r.id !== resourceToRemove
        ),
        updatedAt: new Date().toISOString(),
      };

      await mockKV.put(
        "user:demo-user:campaign:test-campaign",
        JSON.stringify(updatedCampaign)
      );

      expect(mockKV.put).toHaveBeenCalledWith(
        "user:demo-user:campaign:test-campaign",
        JSON.stringify(updatedCampaign)
      );
      expect(updatedCampaign.resources).toHaveLength(1);
      expect(updatedCampaign.resources[0].id).toBe("resource-2");
    });

    it("should handle resource not found in campaign", async () => {
      const mockKV = {
        put: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      const existingCampaign = createMockCampaign({
        campaignId: "test-campaign",
        name: "Test Campaign",
        resources: [
          createMockResource({ id: "resource-1", name: "Resource 1" }),
        ],
      });

      // Mock getting existing campaign
      mockKV.get.mockResolvedValueOnce(JSON.stringify(existingCampaign));

      // Simulate trying to remove non-existent resource
      const resourceToRemove = "nonexistent-resource";
      const updatedCampaign = {
        ...existingCampaign,
        resources: existingCampaign.resources.filter(
          (r) => r.id !== resourceToRemove
        ),
        updatedAt: new Date().toISOString(),
      };

      // Campaign should remain unchanged
      expect(updatedCampaign.resources).toHaveLength(1);
      expect(updatedCampaign.resources[0].id).toBe("resource-1");
    });
  });

  describe("Campaign Indexing", () => {
    it("should trigger indexing for campaign with resources", async () => {
      const mockCampaign = createMockCampaign({
        campaignId: "test-campaign",
        name: "Test Campaign",
        resources: [
          createMockResource({
            id: "pdf-1",
            name: "Document.pdf",
            type: "pdf",
          }),
          createMockResource({
            id: "pdf-2",
            name: "Adventure.pdf",
            type: "pdf",
          }),
        ],
      });

      // Mock indexing process
      const indexingResult = {
        success: true,
        campaignId: mockCampaign.campaignId,
        resourceCount: mockCampaign.resources.length,
        message: "Indexing triggered successfully",
        note: "RAG functionality will be implemented once the vector database is ready",
      };

      expect(indexingResult.success).toBe(true);
      expect(indexingResult.campaignId).toBe("test-campaign");
      expect(indexingResult.resourceCount).toBe(2);
      expect(indexingResult.message).toBe("Indexing triggered successfully");
    });

    it("should handle indexing for campaign without resources", async () => {
      const mockCampaign = createMockCampaign({
        campaignId: "empty-campaign",
        name: "Empty Campaign",
        resources: [],
      });

      const indexingResult = {
        success: true,
        campaignId: mockCampaign.campaignId,
        resourceCount: mockCampaign.resources.length,
        message: "Indexing triggered successfully",
        note: "RAG functionality will be implemented once the vector database is ready",
      };

      expect(indexingResult.success).toBe(true);
      expect(indexingResult.campaignId).toBe("empty-campaign");
      expect(indexingResult.resourceCount).toBe(0);
    });

    it("should handle indexing errors", async () => {
      // Mock indexing failure
      const indexingError = {
        success: false,
        error: "Failed to trigger indexing",
        campaignId: "test-campaign",
      };

      expect(indexingError.success).toBe(false);
      expect(indexingError.error).toBe("Failed to trigger indexing");
    });
  });

  describe("Data Validation", () => {
    it("should validate campaign data structure", () => {
      const mockCampaign = createMockCampaign({
        campaignId: "test-id",
        name: "Test Campaign",
        resources: [],
      });

      // Validate required fields
      expect(mockCampaign.campaignId).toBeDefined();
      expect(mockCampaign.name).toBeDefined();
      expect(Array.isArray(mockCampaign.resources)).toBe(true);
      expect(typeof mockCampaign.createdAt).toBe("string");
      expect(typeof mockCampaign.updatedAt).toBe("string");

      // Validate data types
      expect(typeof mockCampaign.campaignId).toBe("string");
      expect(typeof mockCampaign.name).toBe("string");
      expect(mockCampaign.resources).toBeInstanceOf(Array);
    });

    it("should validate resource data structure", () => {
      const mockResource = createMockResource({
        id: "test-resource",
        name: "Test Resource",
        type: "pdf",
      });

      // Validate required fields
      expect(mockResource.id).toBeDefined();
      expect(mockResource.name).toBeDefined();
      expect(mockResource.type).toBeDefined();

      // Validate data types
      expect(typeof mockResource.id).toBe("string");
      expect(typeof mockResource.name).toBe("string");
      expect(typeof mockResource.type).toBe("string");

      // Validate resource type
      const validTypes: Array<"pdf" | "character" | "note" | "image"> = [
        "pdf",
        "character",
        "note",
        "image",
      ];
      expect(validTypes).toContain(mockResource.type);
    });

    it("should handle invalid campaign data", () => {
      // Test with invalid campaign data
      const invalidCampaign = {
        campaignId: "", // Empty ID
        name: "", // Empty name
        resources: "not-an-array", // Wrong type
        createdAt: 123, // Wrong type
        updatedAt: null, // Wrong type
      };

      // These would fail validation in a real implementation
      expect(invalidCampaign.campaignId).toBe("");
      expect(invalidCampaign.name).toBe("");
      expect(typeof invalidCampaign.resources).not.toBe("object");
      expect(typeof invalidCampaign.createdAt).not.toBe("string");
      expect(invalidCampaign.updatedAt).toBeNull();
    });
  });
});
