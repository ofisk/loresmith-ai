import type { D1Database } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { ERROR_MESSAGES } from "../constants";
import type { AuthContext, AuthEnv } from "../lib/auth";
import { requireAuth } from "../lib/middleware";
import { campaignTools } from "../tools/campaign";
import { BaseAgent } from "./base-agent";

interface Env extends AuthEnv {
  DB: D1Database;
  PDF_BUCKET: R2Bucket;
  Chat: DurableObjectNamespace;
  UserFileTracker: DurableObjectNamespace;
  CampaignManager: DurableObjectNamespace;
}

const CAMPAIGN_SYSTEM_PROMPT = `You are a Campaign Management AI assistant.

### CRITICAL RULE ###
Use tools for campaign operations. Provide direct responses for general conversation or when no campaign action is needed.

### TOOL MAPPING ###
"show me all campaigns" → USE listCampaigns tool
"list my campaigns" → USE listCampaigns tool  
"what campaigns do I have" → USE listCampaigns tool
"create a campaign" → USE createCampaign tool
"add resource to campaign" → USE addResourceToCampaign tool
"show campaign details" → USE showCampaignDetails tool

### AVAILABLE TOOLS ###
- listCampaigns: Lists all campaigns for the user
- createCampaign: Creates a new campaign
- listCampaignResources: Lists resources in a specific campaign
- addResourceToCampaign: Adds a resource to a campaign
- showCampaignDetails: Shows detailed information about a campaign
- deleteCampaign: Deletes a campaign
- deleteCampaigns: Deletes multiple campaigns

### EXECUTION RULES ###
1. Use tools for campaign-related operations
2. Provide direct, helpful responses for general conversation
3. If a user's message doesn't relate to campaigns, respond directly without using tools
4. When using tools, provide a clear response based on the tool result

### RESPONSE FORMAT ###
- For campaign requests: Use the appropriate tool and explain the result
- For general conversation: Respond directly and helpfully
- Always be clear about what happened and what the user can do next

### SPECIALIZATION ###
You handle campaign management. Redirect other topics to appropriate agents.`;

/**
 * Unified Campaign Agent that handles both HTTP routes and AI interactions
 */
export class CampaignAgent extends BaseAgent {
  private app: Hono<{ Bindings: Env; Variables: AuthContext }>;

  constructor(ctx: DurableObjectState, env: Env, model: any) {
    super(ctx, env, model, campaignTools, CAMPAIGN_SYSTEM_PROMPT);

    // Initialize HTTP routes
    this.app = new Hono<{ Bindings: Env; Variables: AuthContext }>();
    this.setupRoutes();
  }

  private setupRoutes() {
    // GET /campaigns - List all campaigns for authenticated user
    this.app.get("/campaigns", requireAuth, async (c) => {
      try {
        const userId = c.get("auth")!.username;

        const { results } = await c.env.DB.prepare(
          "SELECT * FROM campaigns WHERE username = ? ORDER BY created_at DESC"
        )
          .bind(userId)
          .all();

        console.log(
          `[GET] Listing campaigns for user`,
          userId,
          "found campaigns:",
          results.length
        );

        return c.json({ campaigns: results });
      } catch (error) {
        console.error("Error fetching campaigns:", error);
        return c.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, 500);
      }
    });

    // POST /campaigns - Create a new campaign for authenticated user
    this.app.post("/campaigns", requireAuth, async (c) => {
      try {
        const { name, description } = await c.req.json();

        if (!name || typeof name !== "string" || name.trim() === "") {
          return c.json({ error: ERROR_MESSAGES.CAMPAIGN_NAME_REQUIRED }, 400);
        }

        const userId = c.get("auth")!.username;
        const campaignId = crypto.randomUUID();
        const now = new Date().toISOString();

        const campaign = {
          id: campaignId,
          username: userId,
          name: name.trim(),
          description: description?.trim() || null,
          status: "active",
          metadata: JSON.stringify({}),
          created_at: now,
          updated_at: now,
        };

        // Store in D1
        await c.env.DB.prepare(
          "INSERT INTO campaigns (id, username, name, description, status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
          .bind(
            campaign.id,
            campaign.username,
            campaign.name,
            campaign.description,
            campaign.status,
            campaign.metadata,
            campaign.created_at,
            campaign.updated_at
          )
          .run();

        console.log(
          `[POST] Created campaign for user`,
          userId,
          ":",
          campaignId
        );
        return c.json({ success: true, campaign });
      } catch (error) {
        console.error("Error creating campaign:", error);
        return c.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, 500);
      }
    });

    // GET /campaigns/:campaignId - Get campaign details for authenticated user
    this.app.get("/campaigns/:campaignId", requireAuth, async (c) => {
      try {
        const campaignId = c.req.param("campaignId");

        if (!campaignId) {
          return c.json({ error: ERROR_MESSAGES.CAMPAIGN_ID_REQUIRED }, 400);
        }

        const userId = c.get("auth")!.username;

        const { results } = await c.env.DB.prepare(
          "SELECT * FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .all();

        if (results.length === 0) {
          return c.json({ error: ERROR_MESSAGES.CAMPAIGN_NOT_FOUND }, 404);
        }

        const campaign = results[0];
        console.log(
          `[GET] Retrieved campaign for user`,
          userId,
          ":",
          campaignId
        );
        return c.json({ campaign });
      } catch (error) {
        console.error("Error fetching campaign:", error);
        return c.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, 500);
      }
    });

    // POST /campaigns/:campaignId/resource - Add resource to campaign for authenticated user
    this.app.post("/campaigns/:campaignId/resource", requireAuth, async (c) => {
      try {
        const campaignId = c.req.param("campaignId");
        const { file_key, file_name, description, tags } = await c.req.json();

        if (!campaignId) {
          return c.json({ error: ERROR_MESSAGES.CAMPAIGN_ID_REQUIRED }, 400);
        }
        if (!file_key) {
          return c.json({ error: "file_key is required" }, 400);
        }
        if (!file_name) {
          return c.json({ error: "file_name is required" }, 400);
        }

        const userId = c.get("auth")!.username;

        // Verify campaign exists and belongs to user
        const campaignResult = await c.env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return c.json({ error: ERROR_MESSAGES.CAMPAIGN_NOT_FOUND }, 404);
        }

        // Add the resource
        const resourceId = crypto.randomUUID();
        const now = new Date().toISOString();

        await c.env.DB.prepare(
          "INSERT INTO campaign_resources (id, campaign_id, file_key, file_name, description, tags, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
          .bind(
            resourceId,
            campaignId,
            file_key,
            file_name,
            description || null,
            tags ? JSON.stringify(tags) : null,
            "active",
            now
          )
          .run();

        // Update campaign updated_at
        await c.env.DB.prepare(
          "UPDATE campaigns SET updated_at = ? WHERE id = ?"
        )
          .bind(now, campaignId)
          .run();

        console.log(
          "[POST] Added resource to campaign for user",
          userId,
          ":",
          campaignId
        );

        // Get all resources for this campaign
        const { results: resources } = await c.env.DB.prepare(
          "SELECT * FROM campaign_resources WHERE campaign_id = ? ORDER BY created_at DESC"
        )
          .bind(campaignId)
          .all();

        return c.json({ success: true, resources });
      } catch (error) {
        console.error("Error adding resource:", error);
        return c.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, 500);
      }
    });

    // DELETE /campaigns/:campaignId/resource/:resourceId - Remove resource from campaign for authenticated user
    this.app.delete(
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

          // Verify campaign exists and belongs to user
          const campaignResult = await c.env.DB.prepare(
            "SELECT id FROM campaigns WHERE id = ? AND username = ?"
          )
            .bind(campaignId, userId)
            .first();

          if (!campaignResult) {
            return c.json({ error: ERROR_MESSAGES.CAMPAIGN_NOT_FOUND }, 404);
          }

          // Delete the resource
          const result = await c.env.DB.prepare(
            "DELETE FROM campaign_resources WHERE id = ? AND campaign_id = ?"
          )
            .bind(resourceId, campaignId)
            .run();

          if (result.meta.changes === 0) {
            return c.json({ error: "Resource not found" }, 404);
          }

          // Update campaign updated_at
          await c.env.DB.prepare(
            "UPDATE campaigns SET updated_at = ? WHERE id = ?"
          )
            .bind(new Date().toISOString(), campaignId)
            .run();

          console.log(
            "[DELETE] Removed resource from campaign for user",
            userId,
            ":",
            campaignId
          );
          return c.json({ success: true });
        } catch (error) {
          console.error("Error removing resource:", error);
          return c.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, 500);
        }
      }
    );

    // PUT /campaigns/:campaignId - Update campaign for authenticated user
    this.app.put("/campaigns/:campaignId", requireAuth, async (c) => {
      try {
        const campaignId = c.req.param("campaignId");
        const { name, description, status } = await c.req.json();

        if (!campaignId) {
          return c.json({ error: ERROR_MESSAGES.CAMPAIGN_ID_REQUIRED }, 400);
        }

        const userId = c.get("auth")!.username;

        // Verify campaign exists and belongs to user
        const campaignResult = await c.env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return c.json({ error: ERROR_MESSAGES.CAMPAIGN_NOT_FOUND }, 404);
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (name !== undefined) {
          updates.push("name = ?");
          values.push(name.trim());
        }

        if (description !== undefined) {
          updates.push("description = ?");
          values.push(description?.trim() || null);
        }

        if (status !== undefined) {
          updates.push("status = ?");
          values.push(status);
        }

        if (updates.length === 0) {
          return c.json({ error: "No fields to update" }, 400);
        }

        updates.push("updated_at = ?");
        values.push(new Date().toISOString());
        values.push(campaignId);

        const query = `UPDATE campaigns SET ${updates.join(", ")} WHERE id = ?`;

        await c.env.DB.prepare(query)
          .bind(...values)
          .run();

        console.log(`[PUT] Updated campaign for user`, userId, ":", campaignId);
        return c.json({ success: true });
      } catch (error) {
        console.error("Error updating campaign:", error);
        return c.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, 500);
      }
    });

    // DELETE /campaigns/:campaignId - Delete campaign for authenticated user
    this.app.delete("/campaigns/:campaignId", requireAuth, async (c) => {
      try {
        const campaignId = c.req.param("campaignId");

        if (!campaignId) {
          return c.json({ error: ERROR_MESSAGES.CAMPAIGN_ID_REQUIRED }, 400);
        }

        const userId = c.get("auth")!.username;

        // Verify campaign exists and belongs to user
        const campaignResult = await c.env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return c.json({ error: ERROR_MESSAGES.CAMPAIGN_NOT_FOUND }, 404);
        }

        // Delete campaign (resources will be deleted via CASCADE)
        await c.env.DB.prepare("DELETE FROM campaigns WHERE id = ?")
          .bind(campaignId)
          .run();

        console.log(
          `[DELETE] Deleted campaign for user`,
          userId,
          ":",
          campaignId
        );
        return c.json({ success: true });
      } catch (error) {
        console.error("Error deleting campaign:", error);
        return c.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, 500);
      }
    });

    // GET /campaigns/:campaignId/resources - Get all resources for a campaign
    this.app.get("/campaigns/:campaignId/resources", requireAuth, async (c) => {
      try {
        const campaignId = c.req.param("campaignId");

        if (!campaignId) {
          return c.json({ error: ERROR_MESSAGES.CAMPAIGN_ID_REQUIRED }, 400);
        }

        const userId = c.get("auth")!.username;

        // Verify campaign exists and belongs to user
        const campaignResult = await c.env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return c.json({ error: ERROR_MESSAGES.CAMPAIGN_NOT_FOUND }, 404);
        }

        // Get all resources for this campaign
        const { results: resources } = await c.env.DB.prepare(
          "SELECT * FROM campaign_resources WHERE campaign_id = ? ORDER BY created_at DESC"
        )
          .bind(campaignId)
          .all();

        console.log(
          `[GET] Retrieved resources for campaign`,
          campaignId,
          ":",
          resources.length
        );
        return c.json({ resources });
      } catch (error) {
        console.error("Error fetching campaign resources:", error);
        return c.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, 500);
      }
    });
  }

  // Method to handle HTTP requests
  async handleHttpRequest(request: Request, env: Env): Promise<Response> {
    return this.app.fetch(request, env);
  }
}

// Export the HTTP app for direct use if needed
export default new Hono<{ Bindings: Env; Variables: AuthContext }>();
