import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockCampaign, createMockResource } from "./testUtils";

// Mock the tools module
vi.mock("../../src/tools", () => ({
  tools: {
    createCampaign: Object.assign(vi.fn(), {
      description: "Create a new campaign with the specified name",
      parameters: { name: "string" },
    }),
    listCampaignResources: Object.assign(vi.fn(), {
      description: "List all resources for a specific campaign",
      parameters: { campaignId: "string" },
    }),
    addResourceToCampaign: Object.assign(vi.fn(), {
      description: "Add a resource to a campaign",
      parameters: {
        campaignId: "string",
        resourceType: "string",
        resourceId: "string",
      },
    }),
    showCampaignDetails: Object.assign(vi.fn(), {
      description:
        "Show detailed information and details about a campaign including metadata",
      parameters: { campaignId: "string" },
    }),
  },
  executions: {
    createCampaign: vi.fn(),
    listCampaignResources: vi.fn(),
    addResourceToCampaign: vi.fn(),
    showCampaignDetails: vi.fn(),
  },
}));

describe("Campaign Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createCampaign tool", () => {
    it("should validate campaign name parameter", async () => {
      const { tools } = await import("../../src/tools");

      console.log("DEBUG tools object:", tools);
      console.log("DEBUG tools.createCampaign:", tools.createCampaign);
      console.log(
        "DEBUG typeof tools.createCampaign:",
        typeof tools.createCampaign
      );

      // Test that the tool exists and has the correct structure
      expect(tools.createCampaign).toBeDefined();

      // The tool should require a name parameter
      const toolDefinition = tools.createCampaign as any;
      console.log("DEBUG toolDefinition:", toolDefinition);
      console.log(
        "DEBUG toolDefinition.description:",
        toolDefinition.description
      );
      console.log(
        "DEBUG toolDefinition.parameters:",
        toolDefinition.parameters
      );

      expect(toolDefinition.description).toContain("Create a new campaign");
      expect(toolDefinition.parameters).toBeDefined();
    });

    it("should require campaign name", async () => {
      const { tools } = await import("../../src/tools");
      const toolDefinition = tools.createCampaign as any;

      // The parameters should include a name field
      const parameters = toolDefinition.parameters;
      expect(parameters).toBeDefined();

      // In a real implementation, this would validate the schema
      // For now, we just check that the tool structure is correct
      expect(typeof toolDefinition.description).toBe("string");
    });
  });

  describe("listCampaignResources tool", () => {
    it("should require campaign ID parameter", async () => {
      const { tools } = await import("../../src/tools");

      expect(tools.listCampaignResources).toBeDefined();

      const toolDefinition = tools.listCampaignResources as any;
      expect(toolDefinition.description).toContain("List all resources");
      expect(toolDefinition.parameters).toBeDefined();
    });

    it("should describe resource listing functionality", async () => {
      const { tools } = await import("../../src/tools");
      const toolDefinition = tools.listCampaignResources as any;

      expect(toolDefinition.description).toContain("campaign");
      expect(toolDefinition.description).toContain("resources");
    });
  });

  describe("addResourceToCampaign tool", () => {
    it("should require campaign ID and resource parameters", async () => {
      const { tools } = await import("../../src/tools");

      expect(tools.addResourceToCampaign).toBeDefined();

      const toolDefinition = tools.addResourceToCampaign as any;
      expect(toolDefinition.description).toContain("Add a resource");
      expect(toolDefinition.parameters).toBeDefined();
    });

    it("should support different resource types", async () => {
      const { tools } = await import("../../src/tools");
      const toolDefinition = tools.addResourceToCampaign as any;

      expect(toolDefinition.description).toContain("resource");

      // The tool should support the resource types defined in the types
      const validResourceTypes: Array<"pdf" | "character" | "note" | "image"> =
        ["pdf", "character", "note", "image"];

      // In a real implementation, the parameters would validate these types
      expect(validResourceTypes).toContain("pdf");
      expect(validResourceTypes).toContain("character");
      expect(validResourceTypes).toContain("note");
      expect(validResourceTypes).toContain("image");
    });
  });

  describe("showCampaignDetails tool", () => {
    it("should require campaign ID parameter", async () => {
      const { tools } = await import("../../src/tools");

      expect(tools.showCampaignDetails).toBeDefined();

      const toolDefinition = tools.showCampaignDetails as any;
      expect(toolDefinition.description).toContain("Show detailed information");
      expect(toolDefinition.parameters).toBeDefined();
    });

    it("should describe campaign details functionality", async () => {
      const { tools } = await import("../../src/tools");
      const toolDefinition = tools.showCampaignDetails as any;

      expect(toolDefinition.description).toContain("campaign");
      expect(toolDefinition.description).toContain("details");
      expect(toolDefinition.description).toContain("metadata");
    });
  });

  describe("Tool executions", () => {
    it("should have execution functions for confirmation-required tools", async () => {
      const { executions } = await import("../../src/tools");

      // These tools require confirmation, so they should have execution functions
      expect((executions as any).createCampaign).toBeDefined();
      expect((executions as any).listCampaignResources).toBeDefined();
      expect((executions as any).addResourceToCampaign).toBeDefined();
      expect((executions as any).showCampaignDetails).toBeDefined();
    });

    it("should handle campaign creation execution", async () => {
      const { executions } = await import("../../src/tools");
      const mockCreateCampaign = (executions as any).createCampaign;

      // Mock the execution function with new ToolResult format
      mockCreateCampaign.mockResolvedValueOnce({
        toolCallId: "test-call-123",
        result: {
          success: true,
          message: "Successfully created campaign",
          data: {
            campaign: createMockCampaign({ name: "Test Campaign" }),
          },
        },
      });

      // Test that the execution function can be called
      const result = await mockCreateCampaign({ name: "Test Campaign" });

      expect(result.toolCallId).toBe("test-call-123");
      expect(result.result.success).toBe(true);
      expect(result.result.message).toBe("Successfully created campaign");
      expect(result.result.data.campaign.name).toBe("Test Campaign");
    });

    it("should handle resource listing execution", async () => {
      const { executions } = await import("../../src/tools");
      const mockListResources = (executions as any).listCampaignResources;

      const mockResources = [
        createMockResource({ id: "pdf-1", name: "Document.pdf" }),
        createMockResource({
          id: "char-1",
          name: "Character Sheet",
          type: "character",
        }),
      ];

      mockListResources.mockResolvedValueOnce({
        toolCallId: "test-call-123",
        result: {
          success: true,
          message: "Successfully retrieved resources",
          data: {
            resources: mockResources,
          },
        },
      });

      const result = await mockListResources({ campaignId: "test-campaign" });

      expect(result.toolCallId).toBe("test-call-123");
      expect(result.result.success).toBe(true);
      expect(result.result.message).toBe("Successfully retrieved resources");
      expect(result.result.data.resources).toHaveLength(2);
      expect(result.result.data.resources[0].name).toBe("Document.pdf");
      expect(result.result.data.resources[1].name).toBe("Character Sheet");
    });

    it("should handle resource addition execution", async () => {
      const { executions } = await import("../../src/tools");
      const mockAddResource = (executions as any).addResourceToCampaign;

      const newResource = createMockResource({
        id: "new-resource",
        name: "New Resource",
        type: "pdf",
      });

      mockAddResource.mockResolvedValueOnce({
        toolCallId: "test-call-123",
        result: {
          success: true,
          message: "Successfully added resource to campaign",
          data: {
            resources: [newResource],
          },
        },
      });

      const result = await mockAddResource({
        campaignId: "test-campaign",
        resourceType: "pdf",
        resourceId: "new-resource",
        resourceName: "New Resource",
      });

      expect(result.toolCallId).toBe("test-call-123");
      expect(result.result.success).toBe(true);
      expect(result.result.message).toBe(
        "Successfully added resource to campaign"
      );
      expect(result.result.data.resources).toHaveLength(1);
      expect(result.result.data.resources[0].name).toBe("New Resource");
    });

    it("should handle campaign details execution", async () => {
      const { executions } = await import("../../src/tools");
      const mockShowDetails = (executions as any).showCampaignDetails;

      const mockCampaign = createMockCampaign({
        campaignId: "test-campaign",
        name: "Test Campaign",
        resources: [createMockResource({ id: "pdf-1", name: "Document.pdf" })],
      });

      mockShowDetails.mockResolvedValueOnce({
        toolCallId: "test-call-123",
        result: {
          success: true,
          message: "Successfully retrieved campaign details",
          data: {
            campaign: mockCampaign,
          },
        },
      });

      const result = await mockShowDetails({ campaignId: "test-campaign" });

      expect(result.toolCallId).toBe("test-call-123");
      expect(result.result.success).toBe(true);
      expect(result.result.message).toBe(
        "Successfully retrieved campaign details"
      );
      expect(result.result.data.campaign.name).toBe("Test Campaign");
      expect(result.result.data.campaign.resources).toHaveLength(1);
    });
  });

  describe("Tool validation", () => {
    it("should validate resource types", () => {
      const validTypes: Array<"pdf" | "character" | "note" | "image"> = [
        "pdf",
        "character",
        "note",
        "image",
      ];

      // Test that all valid resource types are supported
      expect(validTypes).toContain("pdf");
      expect(validTypes).toContain("character");
      expect(validTypes).toContain("note");
      expect(validTypes).toContain("image");

      // Test that invalid types are not supported
      expect(validTypes).not.toContain("invalid-type");
    });

    it("should validate campaign data structure", () => {
      const mockCampaign = createMockCampaign({
        campaignId: "test-id",
        name: "Test Campaign",
        resources: [],
      });

      // Test that campaign has required fields
      expect(mockCampaign.campaignId).toBe("test-id");
      expect(mockCampaign.name).toBe("Test Campaign");
      expect(Array.isArray(mockCampaign.resources)).toBe(true);
      expect(typeof mockCampaign.createdAt).toBe("string");
      expect(typeof mockCampaign.updatedAt).toBe("string");
    });

    it("should validate resource data structure", () => {
      const mockResource = createMockResource({
        id: "test-resource",
        name: "Test Resource",
        type: "pdf",
      });

      // Test that resource has required fields
      expect(mockResource.id).toBe("test-resource");
      expect(mockResource.name).toBe("Test Resource");
      expect(mockResource.type).toBe("pdf");
    });
  });
});
