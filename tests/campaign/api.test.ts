import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
// Import the campaign agent
import campaignAgent from "../../src/agents/campaign-agent";
import {
  createCampaignsKVStub,
  createMockCampaign,
  createMockResource,
  createTestEnv,
} from "./testUtils";

// Helper function to generate a valid JWT for testing
async function generateTestJWT(username = "test-user"): Promise<string> {
  const secret = "test-admin-secret";
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ type: "user-auth", username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

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
      const testJWT = await generateTestJWT("test-user");
      const request = new Request(
        "http://example.com/campaign/test-campaign-123/index",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
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
      const testJWT = await generateTestJWT("test-user");
      const request = new Request("http://example.com/campaign//index", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testJWT}`,
        },
      });

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, testEnv, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(404);
    });

    it("should return 404 when campaign is not found", async () => {
      const env = createTestEnv([], undefined, true);
      const testJWT = await generateTestJWT("test-user");
      const request = new Request(
        "http://example.com/campaign/nonexistent/index",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
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
      const testJWT = await generateTestJWT("test-user");
      const request = new Request(
        "http://example.com/campaign/test-campaign-123/index",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
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
    it("should reject unauthenticated requests", async () => {
      const env = createTestEnv();
      const request = new Request("http://example.com/campaigns");

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
      const result = (await response.json()) as any;
      expect(result.error).toBe("Missing or invalid Authorization header");
    });

    it("should ensure user data isolation - UserA cannot see UserB's campaigns", async () => {
      // Create test environment with campaigns for both users
      const userACampaigns = [
        createMockCampaign({
          campaignId: "user-a-campaign-1",
          name: "User A Campaign 1",
        }),
        createMockCampaign({
          campaignId: "user-a-campaign-2",
          name: "User A Campaign 2",
        }),
      ];

      const userBCampaigns = [
        createMockCampaign({
          campaignId: "user-b-campaign-1",
          name: "User B Campaign 1",
        }),
        createMockCampaign({
          campaignId: "user-b-campaign-2",
          name: "User B Campaign 2",
        }),
      ];

      // Create KV data with user-scoped keys
      const kvData: Record<string, string> = {};

      // Add UserA's campaigns
      for (const campaign of userACampaigns) {
        const key = `user:user-a:campaign:${campaign.campaignId}`;
        kvData[key] = JSON.stringify(campaign);
      }

      // Add UserB's campaigns
      for (const campaign of userBCampaigns) {
        const key = `user:user-b:campaign:${campaign.campaignId}`;
        kvData[key] = JSON.stringify(campaign);
      }

      const env = createTestEnv();
      // Override the KV stub to return our test data
      env.CAMPAIGNS_KV = createCampaignsKVStub(kvData, true);

      // Test that UserA only sees their own campaigns
      const userAJWT = await generateTestJWT("user-a");
      const userARequest = new Request("http://example.com/campaigns", {
        headers: {
          Authorization: `Bearer ${userAJWT}`,
        },
      });

      const ctx1 = createExecutionContext();
      const userAResponse = await campaignAgent.fetch(userARequest, env, ctx1);
      await waitOnExecutionContext(ctx1);

      expect(userAResponse.status).toBe(200);
      const userAResult = (await userAResponse.json()) as any;
      expect(userAResult.campaigns).toHaveLength(2);
      expect(userAResult.campaigns.map((c: any) => c.campaignId)).toEqual([
        "user-a-campaign-1",
        "user-a-campaign-2",
      ]);

      // Test that UserB only sees their own campaigns
      const userBJWT = await generateTestJWT("user-b");
      const userBRequest = new Request("http://example.com/campaigns", {
        headers: {
          Authorization: `Bearer ${userBJWT}`,
        },
      });

      const ctx2 = createExecutionContext();
      const userBResponse = await campaignAgent.fetch(userBRequest, env, ctx2);
      await waitOnExecutionContext(ctx2);

      expect(userBResponse.status).toBe(200);
      const userBResult = (await userBResponse.json()) as any;
      expect(userBResult.campaigns).toHaveLength(2);
      expect(userBResult.campaigns.map((c: any) => c.campaignId)).toEqual([
        "user-b-campaign-1",
        "user-b-campaign-2",
      ]);

      // Verify that UserA cannot see UserB's campaigns and vice versa
      expect(userAResult.campaigns).not.toContainEqual(
        expect.objectContaining({ campaignId: "user-b-campaign-1" })
      );
      expect(userAResult.campaigns).not.toContainEqual(
        expect.objectContaining({ campaignId: "user-b-campaign-2" })
      );
      expect(userBResult.campaigns).not.toContainEqual(
        expect.objectContaining({ campaignId: "user-a-campaign-1" })
      );
      expect(userBResult.campaigns).not.toContainEqual(
        expect.objectContaining({ campaignId: "user-a-campaign-2" })
      );
    });

    it("should list all campaigns for a user", async () => {
      const mockCampaigns = [
        createMockCampaign({ campaignId: "campaign-1", name: "Campaign 1" }),
        createMockCampaign({ campaignId: "campaign-2", name: "Campaign 2" }),
      ];

      const env = createTestEnv(mockCampaigns);
      const testJWT = await generateTestJWT("test-user");
      const request = new Request("http://example.com/campaigns", {
        headers: {
          Authorization: `Bearer ${testJWT}`,
        },
      });

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
      const testJWT = await generateTestJWT("test-user");
      const request = new Request("http://example.com/campaigns", {
        headers: {
          Authorization: `Bearer ${testJWT}`,
        },
      });

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
      const testJWT = await generateTestJWT("test-user");
      const request = new Request("http://example.com/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testJWT}`,
        },
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
      const testJWT = await generateTestJWT("test-user");
      const request = new Request("http://example.com/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testJWT}`,
        },
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
      const testJWT = await generateTestJWT("test-user");
      const request = new Request("http://example.com/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testJWT}`,
        },
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
    it("should ensure users cannot access each other's campaigns", async () => {
      // Create test environment with campaigns for both users
      const userACampaign = createMockCampaign({
        campaignId: "user-a-campaign",
        name: "User A Campaign",
      });

      const userBCampaign = createMockCampaign({
        campaignId: "user-b-campaign",
        name: "User B Campaign",
      });

      // Create KV data with user-scoped keys
      const kvData: Record<string, string> = {};
      kvData[`user:user-a:campaign:${userACampaign.campaignId}`] =
        JSON.stringify(userACampaign);
      kvData[`user:user-b:campaign:${userBCampaign.campaignId}`] =
        JSON.stringify(userBCampaign);

      const env = createTestEnv();
      env.CAMPAIGNS_KV = createCampaignsKVStub(kvData, true);

      // Test that UserA cannot access UserB's campaign
      const userAJWT = await generateTestJWT("user-a");
      const userARequest = new Request(
        `http://example.com/campaigns/${userBCampaign.campaignId}`,
        {
          headers: {
            Authorization: `Bearer ${userAJWT}`,
          },
        }
      );

      const ctx1 = createExecutionContext();
      const userAResponse = await campaignAgent.fetch(userARequest, env, ctx1);
      await waitOnExecutionContext(ctx1);

      expect(userAResponse.status).toBe(404);
      const userAResult = (await userAResponse.json()) as any;
      expect(userAResult.error).toBe("Campaign not found");

      // Test that UserB cannot access UserA's campaign
      const userBJWT = await generateTestJWT("user-b");
      const userBRequest = new Request(
        `http://example.com/campaigns/${userACampaign.campaignId}`,
        {
          headers: {
            Authorization: `Bearer ${userBJWT}`,
          },
        }
      );

      const ctx2 = createExecutionContext();
      const userBResponse = await campaignAgent.fetch(userBRequest, env, ctx2);
      await waitOnExecutionContext(ctx2);

      expect(userBResponse.status).toBe(404);
      const userBResult = (await userBResponse.json()) as any;
      expect(userBResult.error).toBe("Campaign not found");

      // Test that users can access their own campaigns
      const userAOwnRequest = new Request(
        `http://example.com/campaigns/${userACampaign.campaignId}`,
        {
          headers: {
            Authorization: `Bearer ${userAJWT}`,
          },
        }
      );

      const ctx3 = createExecutionContext();
      const userAOwnResponse = await campaignAgent.fetch(
        userAOwnRequest,
        env,
        ctx3
      );
      await waitOnExecutionContext(ctx3);

      expect(userAOwnResponse.status).toBe(200);
      const userAOwnResult = (await userAOwnResponse.json()) as any;
      expect(userAOwnResult.campaign.campaignId).toBe(userACampaign.campaignId);

      const userBOwnRequest = new Request(
        `http://example.com/campaigns/${userBCampaign.campaignId}`,
        {
          headers: {
            Authorization: `Bearer ${userBJWT}`,
          },
        }
      );

      const ctx4 = createExecutionContext();
      const userBOwnResponse = await campaignAgent.fetch(
        userBOwnRequest,
        env,
        ctx4
      );
      await waitOnExecutionContext(ctx4);

      expect(userBOwnResponse.status).toBe(200);
      const userBOwnResult = (await userBOwnResponse.json()) as any;
      expect(userBOwnResult.campaign.campaignId).toBe(userBCampaign.campaignId);
    });

    it("should return campaign details", async () => {
      const mockCampaign = createMockCampaign({
        campaignId: "test-campaign",
        name: "Test Campaign",
        resources: [createMockResource({ id: "pdf-1", name: "Document.pdf" })],
      });

      const env = createTestEnv([], mockCampaign);
      const testJWT = await generateTestJWT("test-user");
      const request = new Request(
        "http://example.com/campaigns/test-campaign",
        {
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
        }
      );

      const ctx = createExecutionContext();
      const response = await campaignAgent.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const result = (await response.json()) as any;
      expect(result.campaign).toEqual(mockCampaign);
    });

    it("should return 404 when campaign is not found", async () => {
      const env = createTestEnv([], undefined);
      const testJWT = await generateTestJWT("test-user");
      const request = new Request("http://example.com/campaigns/nonexistent", {
        headers: {
          Authorization: `Bearer ${testJWT}`,
        },
      });

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
      const testJWT = await generateTestJWT("test-user");
      const request = new Request(
        "http://example.com/campaigns/test-campaign/resource",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${testJWT}`,
          },
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
      const testJWT = await generateTestJWT("test-user");
      const request = new Request(
        "http://example.com/campaigns/test-campaign/resource",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${testJWT}`,
          },
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
      const testJWT = await generateTestJWT("test-user");
      const request = new Request(
        "http://example.com/campaigns/test-campaign/resource",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${testJWT}`,
          },
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
      const testJWT = await generateTestJWT("test-user");
      const request = new Request(
        "http://example.com/campaigns/test-campaign",
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
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
      const testJWT = await generateTestJWT("test-user");
      const request = new Request("http://example.com/campaigns/nonexistent", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${testJWT}`,
        },
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
      const testJWT = await generateTestJWT("test-user");
      const request = new Request(
        "http://example.com/campaigns/test-campaign/resource/pdf-1",
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
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
      const testJWT = await generateTestJWT("test-user");
      const request = new Request(
        "http://example.com/campaigns/test-campaign/resource/nonexistent",
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${testJWT}`,
          },
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
