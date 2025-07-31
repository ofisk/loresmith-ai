import type { Context } from "hono";
import type { Env } from "../middleware/auth";
import type { Campaign } from "../types/campaign";
import type { AuthPayload } from "../services/auth-service";

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

// Get all campaigns for user
export async function handleGetCampaigns(c: ContextWithAuth) {
  try {
    console.log("[Server] GET /campaigns - starting request");
    console.log("[Server] Context keys:", Object.keys(c));

    const userAuth = (c as any).userAuth;
    console.log("[Server] User auth from middleware:", userAuth);

    if (!userAuth) {
      console.error("[Server] No user auth found in context");
      return c.json({ error: "Authentication required" }, 401);
    }

    const campaigns = await c.env.DB.prepare(
      "SELECT id, name, description, created_at, updated_at FROM campaigns WHERE username = ? ORDER BY created_at DESC"
    )
      .bind(userAuth.username)
      .all<Campaign>();

    console.log(
      `[Server] Found ${campaigns.results?.length || 0} campaigns for user ${userAuth.username}`
    );

    return c.json({ campaigns: campaigns.results || [] });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Create new campaign
export async function handleCreateCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { name, description } = await c.req.json();

    if (!name) {
      return c.json({ error: "Campaign name is required" }, 400);
    }

    const campaignId = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      "INSERT INTO campaigns (id, name, description, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(campaignId, name, description || "", userAuth.username, now, now)
      .run();

    const newCampaign = {
      campaignId,
      name,
      description: description || "",
      createdAt: now,
      updatedAt: now,
    };

    console.log(
      `[Server] Created campaign: ${campaignId} for user ${userAuth.username}`
    );

    return c.json({ campaign: newCampaign }, 201);
  } catch (error) {
    console.error("Error creating campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get specific campaign
export async function handleGetCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");

    const campaign = await c.env.DB.prepare(
      "SELECT id, name, description, created_at, updated_at FROM campaigns WHERE id = ? AND username = ?"
    )
      .bind(campaignId, userAuth.username)
      .first<Campaign>();

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    return c.json({ campaign });
  } catch (error) {
    console.error("Error fetching campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get campaign resources
export async function handleGetCampaignResources(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");

    // Query campaign resources directly from D1 database
    const resources = await c.env.DB.prepare(
      "SELECT id, campaign_id, file_key, file_name, description, tags, status, created_at FROM campaign_resources WHERE campaign_id = ?"
    )
      .bind(campaignId)
      .all();

    return c.json({ resources: resources.results || [] });
  } catch (error) {
    console.error("Error fetching campaign resources:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Delete specific campaign
export async function handleDeleteCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");

    console.log(`[Server] DELETE /campaigns/${campaignId} - starting request`);
    console.log("[Server] User auth from middleware:", userAuth);

    // First, check if the campaign exists and belongs to the user
    const campaign = await c.env.DB.prepare(
      "SELECT id, name, username FROM campaigns WHERE id = ? AND username = ?"
    )
      .bind(campaignId, userAuth.username)
      .first<{ id: string; name: string; username: string }>();

    if (!campaign) {
      console.log(
        `[Server] Campaign ${campaignId} not found or doesn't belong to user ${userAuth.username}`
      );
      return c.json({ error: "Campaign not found" }, 404);
    }

    console.log("[Server] Found campaign:", campaign);

    // Delete campaign resources first (due to foreign key constraints)
    await c.env.DB.prepare(
      "DELETE FROM campaign_resources WHERE campaign_id = ?"
    )
      .bind(campaignId)
      .run();

    console.log(
      `[Server] Deleted campaign resources for campaign ${campaignId}`
    );

    // Delete the campaign
    await c.env.DB.prepare(
      "DELETE FROM campaigns WHERE id = ? AND username = ?"
    )
      .bind(campaignId, userAuth.username)
      .run();

    console.log(`[Server] Deleted campaign ${campaignId}`);

    return c.json({
      success: true,
      message: "Campaign deleted successfully",
      deletedCampaign: campaign,
    });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Delete all campaigns for user
export async function handleDeleteAllCampaigns(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;

    console.log("[Server] DELETE /campaigns - starting request");
    console.log("[Server] User auth from middleware:", userAuth);

    // First, get all campaigns for the user
    const campaigns = await c.env.DB.prepare(
      "SELECT id, name FROM campaigns WHERE username = ?"
    )
      .bind(userAuth.username)
      .all<{ id: string; name: string }>();

    console.log(
      `[Server] Found ${campaigns.results?.length || 0} campaigns to delete`
    );

    if (!campaigns.results || campaigns.results.length === 0) {
      return c.json({
        success: true,
        message: "No campaigns found to delete",
        deletedCount: 0,
      });
    }

    // Delete campaign resources first (due to foreign key constraints)
    await c.env.DB.prepare(
      "DELETE FROM campaign_resources WHERE campaign_id IN (SELECT id FROM campaigns WHERE username = ?)"
    )
      .bind(userAuth.username)
      .run();

    console.log(
      `[Server] Deleted campaign resources for user ${userAuth.username}`
    );

    // Delete all campaigns for the user
    await c.env.DB.prepare("DELETE FROM campaigns WHERE username = ?")
      .bind(userAuth.username)
      .run();

    console.log(`[Server] Deleted campaigns for user ${userAuth.username}`);

    return c.json({
      success: true,
      message: "All campaigns deleted successfully",
      deletedCount: campaigns.results?.length || 0,
      deletedCampaigns: campaigns.results,
    });
  } catch (error) {
    console.error("Error deleting all campaigns:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
