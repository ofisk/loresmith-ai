import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/server";

// Extend ProvidedEnv for Durable Object binding
// (Assume CAMPAIGN_MANAGER is the binding name in wrangler config)
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    CampaignManager: unknown; // Use unknown for now, replace with correct type if available
  }
}

// Helper function to get the admin secret from env or process.env
function getTestAdminSecret(): string {
  return (
    (env && (env as { ADMIN_SECRET?: string }).ADMIN_SECRET) ||
    process.env.ADMIN_SECRET ||
    (() => {
      throw new Error("ADMIN_SECRET not set in environment");
    })()
  );
}

// Helper function to generate a valid JWT for testing
async function generateTestJWT(username = "test-user"): Promise<string> {
  const secret = getTestAdminSecret();
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ type: "pdf-auth", username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

// Add a mock Durable Object namespace if not present
beforeAll(() => {
  if (!env.CampaignManager) {
    let createdCampaign: unknown = null;
    env.CampaignManager = {
      idFromName: (name: string) => name,
      get: (_id: unknown) => ({
        fetch: async (_url: string, options?: unknown) => {
          const opts = options as Record<string, unknown>;
          if (options && opts.method === "POST") {
            // Simulate campaign creation
            createdCampaign = {
              campaignId: "mock-campaign-id",
              name: JSON.parse(opts.body as string).name,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            return new Response(JSON.stringify({ campaign: createdCampaign }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          // Simulate campaign listing
          return new Response(
            JSON.stringify({
              campaigns: createdCampaign ? [createdCampaign] : [],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        },
      }),
    };
  }
});

describe("Chat worker", () => {
  it("responds with Not found", async () => {
    const request = new Request("http://example.com");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await response.text()).toBe("Not found");
    expect(response.status).toBe(404);
  });
});

describe("CampaignManager Durable Object", () => {
  it("can create and list campaigns for a user", async () => {
    // Simulate a user by userId
    const userId = "test-user-123";
    // Add a type assertion for CAMPAIGN_MANAGER
    const campaignManagerNS = env.CampaignManager as {
      idFromName: (name: string) => unknown;
      get: (id: unknown) => unknown;
    };
    const id = campaignManagerNS.idFromName(userId);
    const stub = campaignManagerNS.get(id) as {
      fetch: (url: string, options?: unknown) => Promise<Response>;
    };

    // Create a campaign
    const createResp = await stub.fetch("https://dummy/campaigns", {
      method: "POST",
      body: JSON.stringify({ name: "Test Campaign" }),
    });
    expect(createResp.status).toBe(200);
    const { campaign } = (await createResp.json()) as { campaign: unknown };
    expect(campaign).toHaveProperty("campaignId");
    expect((campaign as { name: string }).name).toBe("Test Campaign");

    // List campaigns
    const listResp = await stub.fetch("https://dummy/campaigns");
    expect(listResp.status).toBe(200);
    const { campaigns } = (await listResp.json()) as { campaigns: unknown[] };
    expect(Array.isArray(campaigns)).toBe(true);
    expect(campaigns.length).toBeGreaterThanOrEqual(1);
    expect((campaigns[0] as { name: string }).name).toBe("Test Campaign");
  });
});

describe("Campaign API endpoints", () => {
  it("GET /campaigns returns campaigns for the user", async () => {
    const testJWT = await generateTestJWT("test-user-123");

    // First, create a campaign via the DO mock
    const createRequest = new Request("http://localhost/campaigns", {
      method: "POST",
      body: JSON.stringify({ name: "Test Campaign" }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testJWT}`,
      },
    });
    const ctx1 = createExecutionContext();
    await worker.fetch(createRequest, env, ctx1);
    await waitOnExecutionContext(ctx1);

    // Now, list campaigns
    const listRequest = new Request("http://localhost/campaigns", {
      headers: {
        Authorization: `Bearer ${testJWT}`,
      },
    });
    const ctx2 = createExecutionContext();
    const response = await worker.fetch(listRequest, env, ctx2);
    await waitOnExecutionContext(ctx2);
    expect(response.status).toBe(200);
    const { campaigns } = (await response.json()) as { campaigns: unknown[] };
    expect(Array.isArray(campaigns)).toBe(true);
    expect(campaigns.length).toBeGreaterThanOrEqual(1);
    expect((campaigns[0] as { name: string }).name).toBe("Test Campaign");
  });

  it("POST /campaigns creates a new campaign", async () => {
    const testJWT = await generateTestJWT("test-user-456");

    const request = new Request("http://localhost/campaigns", {
      method: "POST",
      body: JSON.stringify({ name: "Another Campaign" }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testJWT}`,
      },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const { campaign } = (await response.json()) as { campaign: unknown };
    expect(campaign).toHaveProperty("campaignId");
    expect((campaign as { name: string }).name).toBe("Another Campaign");
  });
});
