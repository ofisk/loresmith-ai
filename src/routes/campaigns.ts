import type { Context } from "hono";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import type { Campaign } from "../types/campaign";

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

    const selectQuery = `
      SELECT 
        id as campaignId, 
        name, 
        description, 
        username, 
        created_at as createdAt, 
        updated_at as updatedAt 
      FROM campaigns 
      WHERE username = ? 
      ORDER BY created_at DESC
    `;

    const campaigns = await c.env.DB.prepare(selectQuery)
      .bind(userAuth.username)
      .all();

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
      "SELECT id as campaignId, name, description, created_at as createdAt, updated_at as updatedAt FROM campaigns WHERE id = ? AND username = ?"
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

// Add resource to campaign
export async function handleAddResourceToCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");
    const { type, id, name } = await c.req.json();

    console.log(
      `[Server] POST /campaigns/${campaignId}/resource - starting request`
    );
    console.log("[Server] User auth from middleware:", userAuth);
    console.log("[Server] Request body:", { type, id, name });

    if (!type || !id) {
      return c.json({ error: "Resource type and id are required" }, 400);
    }

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

    // Check if resource already exists in this campaign
    const existingResource = await c.env.DB.prepare(
      "SELECT id, file_name FROM campaign_resources WHERE campaign_id = ? AND file_key = ?"
    )
      .bind(campaignId, id)
      .first<{ id: string; file_name: string }>();

    if (existingResource) {
      console.log(
        `[Server] Resource ${id} already exists in campaign ${campaignId}`
      );
      // Return success instead of error - this is idempotent behavior
      return c.json(
        {
          resource: {
            id: existingResource.id,
            campaignId,
            fileKey: id,
            fileName: existingResource.file_name,
            description: "",
            tags: "[]",
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          message: "Resource already exists in this campaign",
        },
        200
      );
    }

    // Add the resource to the campaign
    const resourceId = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      "INSERT INTO campaign_resources (id, campaign_id, file_key, file_name, description, tags, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        resourceId,
        campaignId,
        id,
        name || id,
        "",
        "[]",
        "active",
        now,
        now
      )
      .run();

    console.log(`[Server] Added resource ${id} to campaign ${campaignId}`);

    const newResource = {
      id: resourceId,
      campaignId,
      fileKey: id,
      fileName: name || id,
      description: "",
      tags: "[]",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    return c.json({ resource: newResource }, 201);
  } catch (error) {
    console.error("Error adding resource to campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Remove resource from campaign
export async function handleRemoveResourceFromCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");
    const resourceId = c.req.param("resourceId");

    console.log(
      `[Server] DELETE /campaigns/${campaignId}/resource/${resourceId} - starting request`
    );
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

    // Check if the resource exists in this campaign
    const resource = await c.env.DB.prepare(
      "SELECT id, file_key, file_name FROM campaign_resources WHERE id = ? AND campaign_id = ?"
    )
      .bind(resourceId, campaignId)
      .first<{ id: string; file_key: string; file_name: string }>();

    if (!resource) {
      console.log(
        `[Server] Resource ${resourceId} not found in campaign ${campaignId}`
      );
      return c.json({ error: "Resource not found in this campaign" }, 404);
    }

    console.log("[Server] Found resource:", resource);

    // Remove the resource from the campaign
    await c.env.DB.prepare(
      "DELETE FROM campaign_resources WHERE id = ? AND campaign_id = ?"
    )
      .bind(resourceId, campaignId)
      .run();

    console.log(
      `[Server] Removed resource ${resourceId} from campaign ${campaignId}`
    );

    return c.json({
      success: true,
      message: "Resource removed from campaign successfully",
      removedResource: resource,
    });
  } catch (error) {
    console.error("Error removing resource from campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
