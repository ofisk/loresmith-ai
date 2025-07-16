import { SignJWT } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
// Import the campaign agent
import campaignAgent from "../../src/agents/campaign";
// Import our mocks instead of cloudflare:test
import {
  createExecutionContext,
  waitOnExecutionContext,
} from "../mocks/cloudflare-test";
import {
  createCampaignsKVStub,
  createMockCampaign,
  createTestEnv,
} from "./testUtils";

// Helper function to generate a valid JWT for testing
async function generateTestJWT(username = "test-user"): Promise<string> {
  const secret = "test-admin-secret";
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ type: "pdf-auth", username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

describe("Campaign API Endpoints (Node Environment)", () => {
  beforeEach(() => {
    createTestEnv();
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
      // Ensure ADMIN_SECRET is set
      env.ADMIN_SECRET = "test-admin-secret";
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
        createMockCampaign({
          campaignId: "campaign-1",
          name: "Test Campaign 1",
        }),
        createMockCampaign({
          campaignId: "campaign-2",
          name: "Test Campaign 2",
        }),
      ];

      // Create KV data with user-scoped keys
      const kvData: Record<string, string> = {};
      for (const campaign of mockCampaigns) {
        const key = `user:test-user:campaign:${campaign.campaignId}`;
        kvData[key] = JSON.stringify(campaign);
      }

      const env = createTestEnv();
      // Ensure ADMIN_SECRET is set
      env.ADMIN_SECRET = "test-admin-secret";
      // Override the KV stub to return our test data
      env.CAMPAIGNS_KV = createCampaignsKVStub(kvData, true);

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
      expect(result.campaigns).toBeDefined();
      expect(result.campaigns).toHaveLength(2);
      expect(result.campaigns.map((c: any) => c.campaignId)).toEqual([
        "campaign-1",
        "campaign-2",
      ]);
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
      // Ensure ADMIN_SECRET is set
      env.ADMIN_SECRET = "test-admin-secret";
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
  });
});
