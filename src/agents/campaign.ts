import { Hono } from "hono";
import { ERROR_MESSAGES, USER_MESSAGES } from "../constants";
import {
  type AuthContext,
  type AuthEnv,
  generateUserKey,
  generateUserPrefix,
} from "../lib/auth";
import { requireAuth } from "../lib/middleware";
import type { CampaignData } from "../types/campaign";

interface Env extends AuthEnv {
  CAMPAIGNS_KV: KVNamespace;
}

const app = new Hono<{ Bindings: Env; Variables: AuthContext }>();

// GET /campaigns - List all campaigns for authenticated user
app.get("/campaigns", requireAuth, async (c) => {
  try {
    const userId = c.get("auth")!.username;
    const prefix = generateUserPrefix(userId, "campaign");
    const campaigns = [];
    const listResult = await c.env.CAMPAIGNS_KV.list({ prefix });
    console.log(
      `[GET] Listing campaigns for user`,
      userId,
      "found keys:",
      listResult.keys.map((k) => k.name)
    );
    for (const key of listResult.keys) {
      const campaignData = await c.env.CAMPAIGNS_KV.get(key.name);
      if (campaignData) {
        campaigns.push(JSON.parse(campaignData));
      }
    }
    console.log(
      `[GET] Campaigns returned for user`,
      userId,
      ":",
      campaigns.map((c) => c.campaignId)
    );
    return c.json({ campaigns });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return c.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, 500);
  }
});

// POST /campaigns - Create a new campaign for authenticated user
app.post("/campaigns", requireAuth, async (c) => {
  try {
    const { name } = await c.req.json();

    if (!name || typeof name !== "string" || name.trim() === "") {
      return c.json({ error: ERROR_MESSAGES.CAMPAIGN_NAME_REQUIRED }, 400);
    }

    const userId = c.get("auth")!.username;
    const campaignId = crypto.randomUUID();
    const now = new Date().toISOString();

    const campaign = {
      campaignId,
      name,
      createdAt: now,
      updatedAt: now,
      resources: [],
    };

    // Store in KV with user-scoped key
    const key = generateUserKey(userId, "campaign", campaignId);
    await c.env.CAMPAIGNS_KV.put(key, JSON.stringify(campaign));

    console.log(`[POST] Created campaign for user`, userId, ":", campaignId);
    return c.json({ success: true, campaign });
  } catch (error) {
    console.error("Error creating campaign:", error);
    return c.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, 500);
  }
});

// GET /campaigns/:campaignId - Get campaign details for authenticated user
app.get("/campaigns/:campaignId", requireAuth, async (c) => {
  try {
    const campaignId = c.req.param("campaignId");

    if (!campaignId) {
      return c.json({ error: ERROR_MESSAGES.CAMPAIGN_ID_REQUIRED }, 400);
    }

    const userId = c.get("auth")!.username;
    const key = generateUserKey(userId, "campaign", campaignId);

    const campaignData = await c.env.CAMPAIGNS_KV.get(key);

    if (!campaignData) {
      return c.json({ error: ERROR_MESSAGES.CAMPAIGN_NOT_FOUND }, 404);
    }

    const campaign = JSON.parse(campaignData);
    console.log(`[GET] Retrieved campaign for user`, userId, ":", campaignId);
    return c.json({ campaign });
  } catch (error) {
    console.error("Error fetching campaign:", error);
    return c.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, 500);
  }
});

// POST /campaigns/:campaignId/resource - Add resource to campaign for authenticated user
app.post("/campaigns/:campaignId/resource", requireAuth, async (c) => {
  try {
    const campaignId = c.req.param("campaignId");
    const { type, id, name } = await c.req.json();

    // Check for missing required fields with specific error messages
    if (!campaignId) {
      return c.json({ error: ERROR_MESSAGES.CAMPAIGN_ID_REQUIRED }, 400);
    }
    if (!type) {
      return c.json({ error: ERROR_MESSAGES.RESOURCE_TYPE_REQUIRED }, 400);
    }
    if (!id) {
      return c.json({ error: ERROR_MESSAGES.RESOURCE_ID_REQUIRED }, 400);
    }
    if (!name) {
      return c.json({ error: ERROR_MESSAGES.RESOURCE_NAME_REQUIRED }, 400);
    }

    // Validate resource type
    const validTypes = ["pdf", "document", "image", "video", "audio"];
    if (!validTypes.includes(type)) {
      return c.json({ error: ERROR_MESSAGES.INVALID_RESOURCE_TYPE }, 400);
    }

    const userId = c.get("auth")!.username;
    const key = generateUserKey(userId, "campaign", campaignId);

    const campaignData = await c.env.CAMPAIGNS_KV.get(key);

    if (!campaignData) {
      return c.json({ error: ERROR_MESSAGES.CAMPAIGN_NOT_FOUND }, 404);
    }

    const campaign = JSON.parse(campaignData);

    // Add the resource
    const resource = { type, id, name };
    campaign.resources.push(resource);
    campaign.updatedAt = new Date().toISOString();

    // Update the campaign in KV
    await c.env.CAMPAIGNS_KV.put(key, JSON.stringify(campaign));

    console.log(
      "[POST] Added resource to campaign for user",
      userId,
      ":",
      campaignId
    );
    return c.json({ success: true, resources: campaign.resources });
  } catch (error) {
    console.error("Error adding resource:", error);
    return c.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, 500);
  }
});

// DELETE /campaigns/:campaignId/resource/:resourceId - Remove resource from campaign for authenticated user
app.delete(
  "/campaigns/:campaignId/resource/:resourceId",
  requireAuth,
  async (c) => {
    try {
      const campaignId = c.req.param("campaignId");
      const resourceId = c.req.param("resourceId");

      if (!campaignId || !resourceId) {
        return c.json(
          { error: ERROR_MESSAGES.CAMPAIGN_ID_AND_RESOURCE_ID_REQUIRED },
          400
        );
      }

      const userId = c.get("auth")!.username;
      const key = generateUserKey(userId, "campaign", campaignId);

      const campaignData = await c.env.CAMPAIGNS_KV.get(key);

      if (!campaignData) {
        return c.json({ error: ERROR_MESSAGES.CAMPAIGN_NOT_FOUND }, 404);
      }

      const campaign = JSON.parse(campaignData);

      // Check if resource exists
      const resourceIndex = campaign.resources.findIndex(
        (r: { id: string }) => r.id === resourceId
      );
      if (resourceIndex === -1) {
        return c.json(
          { error: ERROR_MESSAGES.RESOURCE_NOT_FOUND_IN_CAMPAIGN },
          404
        );
      }

      // Remove the resource
      campaign.resources.splice(resourceIndex, 1);
      campaign.updatedAt = new Date().toISOString();

      // Update the campaign in KV
      await c.env.CAMPAIGNS_KV.put(key, JSON.stringify(campaign));

      console.log(
        "[DELETE] Removed resource from campaign for user",
        userId,
        ":",
        campaignId
      );
      return c.json({ success: true, resources: campaign.resources });
    } catch (error) {
      console.error("Error removing resource:", error);
      return c.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, 500);
    }
  }
);

// DELETE /campaigns/:campaignId - Delete campaign for authenticated user
app.delete("/campaigns/:campaignId", requireAuth, async (c) => {
  try {
    const campaignId = c.req.param("campaignId");
    if (!campaignId) {
      console.log("[DELETE] No campaignId provided");
      return c.json({ error: ERROR_MESSAGES.CAMPAIGN_ID_REQUIRED }, 400);
    }
    const userId = c.get("auth")!.username;
    const key = generateUserKey(userId, "campaign", campaignId);
    console.log(
      `[DELETE] Attempting to delete campaign for user ${userId}. campaignId: ${campaignId}, key: ${key}`
    );
    const campaignData = await c.env.CAMPAIGNS_KV.get(key);
    if (!campaignData) {
      console.log(`[DELETE] Campaign not found for key: ${key}`);
      return c.json({ error: ERROR_MESSAGES.CAMPAIGN_NOT_FOUND }, 404);
    }
    await c.env.CAMPAIGNS_KV.delete(key);
    console.log(`[DELETE] Campaign deleted for user ${userId}, key: ${key}`);
    return c.json({ success: true });
  } catch (error) {
    console.error("[DELETE] Internal server error:", error);
    return c.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, 500);
  }
});

// POST /campaign/:id/index - Trigger indexing for a campaign for authenticated user
app.post("/campaign/:id/index", requireAuth, async (c) => {
  try {
    const campaignId = c.req.param("id");
    console.log("[Campaign Agent] Indexing route hit, campaignId:", campaignId);

    // Check for missing or empty campaign ID
    if (!campaignId || campaignId.trim() === "") {
      console.log("[Campaign Agent] Empty campaign ID detected");
      return c.json({ error: ERROR_MESSAGES.CAMPAIGN_ID_REQUIRED }, 400);
    }

    const userId = c.get("auth")!.username;
    const key = generateUserKey(userId, "campaign", campaignId);

    // Fetch campaign data from KV
    const campaignData = await c.env.CAMPAIGNS_KV.get(key);

    if (!campaignData) {
      return c.json({ error: ERROR_MESSAGES.CAMPAIGN_NOT_FOUND }, 404);
    }

    const campaign = JSON.parse(campaignData) as CampaignData;

    // TODO: Implement RAG functionality
    // This endpoint should:
    // 1. Fetch all resources associated with this campaign
    // 2. For each resource (especially PDFs), extract text content
    // 3. Chunk the content appropriately for vector search
    // 4. Store the chunks in the vector database with appropriate metadata
    // 5. Update the campaign's indexing status
    //
    // For now, we'll just return a success response indicating the indexing was "triggered"

    console.log(
      `[Campaign Agent] Indexing triggered for campaign: ${campaignId} (user: ${userId})`
    );
    console.log(
      `[Campaign Agent] Campaign has ${campaign.resources.length} resources`
    );

    return c.json({
      success: true,
      message: USER_MESSAGES.INDEXING_TRIGGERED,
      campaignId,
      resourceCount: campaign.resources.length,
      note: "RAG functionality will be implemented once the vector database is ready",
    });
  } catch (error) {
    console.error("Error triggering campaign indexing:", error);
    return c.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, 500);
  }
});

export default app;
