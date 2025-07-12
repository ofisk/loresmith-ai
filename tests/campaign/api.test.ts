import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
// Import the campaign agent
import campaignAgent from "../../src/agents/campaign";
import {
  createMockCampaign,
  createMockResource,
  createTestEnv,
} from "./testUtils";

declare module "cloudflare:test" {
  interface ProvidedEnv extends ReturnType<typeof createTestEnv> {}
}

describe("Campaign API Endpoints", () => {
  let testEnv: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    testEnv = createTestEnv();
  });

  describe("POST /campaign/:id/index", () => {
    it("should trigger indexing for a valid campaign", async () => {
      const mockCampaign = createMockCampaign({
        campaignId: "test-campaign-123",
        name: "Test Campaign",
        resources: [
          createMockResource({ id: "pdf-1", name: "Rulebook.pdf" }),
          createMockResource({ id: "pdf-2", name: "Adventure.pdf" }),
        ],
      });

      const env = createTestEnv([], mockCampaign, true);
      const request = new Request(
        "http://example.com/campaign/test-campaign-123/index",
        {
          method: "POST",
        }
      );

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const result = (await response.json()) as any;
      expect(result.success).toBe(true);
      expect(result.campaignId).toBe("test-campaign-123");
      expect(result.resourceCount).toBe(2);
      expect(result.message).toBe("Indexing triggered successfully");
    });

    it("should return 404 when campaign ID is missing", async () => {
      const request = new Request("http://example.com/campaign//index", {
        method: "POST",
      });

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, testEnv, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(404);
    });

    it("should return 404 when campaign is not found", async () => {
      const env = createTestEnv([], undefined, true);
      const request = new Request(
        "http://example.com/campaign/nonexistent/index",
        {
          method: "POST",
        }
      );

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(404);
      const result = (await response.json()) as any;
      expect(result.error).toBe("Campaign not found");
    });

    it("should handle KV storage errors gracefully", async () => {
      const env = createTestEnv([], undefined, false);
      const request = new Request(
        "http://example.com/campaign/test-campaign-123/index",
        {
          method: "POST",
        }
      );

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(500);
      const result = (await response.json()) as any;
      expect(result.error).toBe("Internal server error");
    });
  });

  describe("GET /campaigns", () => {
    it("should list all campaigns for a user", async () => {
      const mockCampaigns = [
        createMockCampaign({ campaignId: "campaign-1", name: "Campaign 1" }),
        createMockCampaign({ campaignId: "campaign-2", name: "Campaign 2" }),
      ];

      const env = createTestEnv(mockCampaigns);
      const request = new Request("http://example.com/campaigns");

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const result = (await response.json()) as any;
      expect(result.campaigns).toHaveLength(2);
      expect(result.campaigns[0].name).toBe("Campaign 1");
      expect(result.campaigns[1].name).toBe("Campaign 2");
    });

    it("should return empty array when no campaigns exist", async () => {
      const env = createTestEnv([]);
      const request = new Request("http://example.com/campaigns");

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const result = (await response.json()) as any;
      expect(result.campaigns).toHaveLength(0);
    });
  });

  describe("POST /campaigns", () => {
    it("should create a new campaign", async () => {
      const env = createTestEnv();
      const request = new Request("http://example.com/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Campaign" }),
      });

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const result = (await response.json()) as any;
      expect(result.success).toBe(true);
      expect(result.campaign.name).toBe("New Campaign");
      expect(result.campaign.resources).toHaveLength(0);
    });

    it("should return 400 when campaign name is missing", async () => {
      const request = new Request("http://example.com/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, testEnv, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const result = (await response.json()) as any;
      expect(result.error).toBe("Campaign name is required");
    });

    it("should return 400 when campaign name is empty", async () => {
      const request = new Request("http://example.com/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      });

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, testEnv, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const result = (await response.json()) as any;
      expect(result.error).toBe("Campaign name is required");
    });
  });

  describe("GET /campaigns/:id", () => {
    it("should return campaign details", async () => {
      const mockCampaign = createMockCampaign({
        campaignId: "test-campaign",
        name: "Test Campaign",
        resources: [createMockResource({ id: "pdf-1", name: "Document.pdf" })],
      });

      const env = createTestEnv([], mockCampaign);
      const request = new Request("http://example.com/campaigns/test-campaign");

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const result = (await response.json()) as any;
      expect(result.campaign).toEqual(mockCampaign);
    });

    it("should return 404 when campaign is not found", async () => {
      const env = createTestEnv([], undefined);
      const request = new Request("http://example.com/campaigns/nonexistent");

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(404);
      const result = (await response.json()) as any;
      expect(result.error).toBe("Campaign not found");
    });
  });

  describe("POST /campaigns/:id/resource", () => {
    it("should add a resource to a campaign", async () => {
      const mockCampaign = createMockCampaign({
        campaignId: "test-campaign",
        resources: [],
      });

      const env = createTestEnv([], mockCampaign);
      const request = new Request(
        "http://example.com/campaigns/test-campaign/resource",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "pdf",
            id: "new-pdf-id",
            name: "New Document",
          }),
        }
      );

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const result = (await response.json()) as any;
      expect(result.success).toBe(true);
    });

    it("should return 400 when resource type is invalid", async () => {
      const request = new Request(
        "http://example.com/campaigns/test-campaign/resource",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "invalid-type",
            id: "new-pdf-id",
            name: "New Document",
          }),
        }
      );

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, testEnv, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const result = (await response.json()) as any;
      expect(result.error).toBe("Invalid resource type");
    });

    it("should return 400 when resource ID is missing", async () => {
      const request = new Request(
        "http://example.com/campaigns/test-campaign/resource",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "pdf",
            name: "New Document",
          }),
        }
      );

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, testEnv, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const result = (await response.json()) as any;
      expect(result.error).toBe("Resource ID is required");
    });
  });

  describe("DELETE /campaigns/:id", () => {
    it("should delete a campaign", async () => {
      const mockCampaign = createMockCampaign({
        campaignId: "test-campaign",
      });

      const env = createTestEnv([], mockCampaign);
      const request = new Request(
        "http://example.com/campaigns/test-campaign",
        {
          method: "DELETE",
        }
      );

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const result = (await response.json()) as any;
      expect(result.success).toBe(true);
    });

    it("should return 404 when campaign to delete is not found", async () => {
      const env = createTestEnv([], undefined);
      const request = new Request("http://example.com/campaigns/nonexistent", {
        method: "DELETE",
      });

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(404);
      const result = (await response.json()) as any;
      expect(result.error).toBe("Campaign not found");
    });
  });

  describe("DELETE /campaigns/:id/resource/:resourceId", () => {
    it("should remove a resource from a campaign", async () => {
      const mockCampaign = createMockCampaign({
        campaignId: "test-campaign",
        resources: [createMockResource({ id: "pdf-1", name: "Document.pdf" })],
      });

      const env = createTestEnv([], mockCampaign);
      const request = new Request(
        "http://example.com/campaigns/test-campaign/resource/pdf-1",
        {
          method: "DELETE",
        }
      );

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const result = (await response.json()) as any;
      expect(result.success).toBe(true);
    });

    it("should return 404 when resource is not found in campaign", async () => {
      const mockCampaign = createMockCampaign({
        campaignId: "test-campaign",
        resources: [],
      });

      const env = createTestEnv([], mockCampaign);
      const request = new Request(
        "http://example.com/campaigns/test-campaign/resource/nonexistent",
        {
          method: "DELETE",
        }
      );

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(404);
      const result = (await response.json()) as any;
      expect(result.error).toBe("Resource not found in campaign");
    });
  });
});
