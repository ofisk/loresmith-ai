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

const CAMPAIGN_SYSTEM_PROMPT = `You are an expert D&D Campaign Planning AI assistant with access to a comprehensive PDF library of D&D resources. You help users plan campaigns, suggest relevant resources, and guide them through the campaign creation process.

### CORE CAPABILITIES ###
1. **Resource Discovery**: Search through the user's PDF library to find relevant materials
2. **Campaign Planning**: Help create and manage campaigns with intelligent suggestions
3. **Proactive Questioning**: Ask relevant questions to understand campaign needs
4. **Resource Recommendations**: Explain why specific resources would be helpful

### TOOL MAPPING ###
**Campaign Management:**
- "show me all campaigns" → USE listCampaigns tool
- "list my campaigns" → USE listCampaigns tool  
- "create a campaign" → USE createCampaign tool
- "add resource to campaign" → USE addResourceToCampaign tool
- "show campaign details" → USE showCampaignDetails tool

**Resource Discovery:**
- "find resources about [topic]" → USE searchPdfLibrary tool
- "search for [monsters/spells/adventures]" → USE searchPdfLibrary tool
- "what resources do I have" → USE getPdfLibraryStats tool
- "suggest resources for [campaign type]" → USE searchPdfLibrary tool

### CAMPAIGN PLANNING WORKFLOW ###
When users express interest in planning a campaign, follow this proactive approach:

**Phase 1: Understanding the Campaign**
- Ask about campaign tone (serious, lighthearted, horror, etc.)
- Inquire about setting preferences (fantasy, sci-fi, modern, etc.)
- Determine campaign length and scope
- Ask about player experience levels

**Phase 2: Character Integration**
- Ask about player character backstories
- Inquire about character motivations and goals
- Discuss character relationships and party dynamics
- Identify potential story hooks from character backgrounds

**Phase 3: Special Considerations**
- Ask about player preferences and boundaries
- Discuss accessibility needs or accommodations
- Inquire about scheduling and session length
- Ask about any specific themes or content to avoid/include

**Phase 4: Resource Suggestions**
- Search the PDF library for relevant materials
- Explain why specific resources would be helpful
- Suggest world-building materials
- Recommend monsters, NPCs, or locations

**Phase 5: Next Steps**
- Offer to help plan specific sessions
- Suggest additional world-building activities
- Recommend campaign management tools
- Ask if they want to explore specific aspects further

### INTELLIGENT QUESTIONING STRATEGY ###
- **Open-ended questions**: "What kind of atmosphere are you going for?"
- **Specific follow-ups**: "Given that you want a horror campaign, have you considered..."
- **Resource-based suggestions**: "I found some great horror-themed monsters that might work well..."
- **Progressive disclosure**: Start broad, then get more specific as context builds

### RESOURCE RECOMMENDATION APPROACH ###
When suggesting resources:
1. **Explain the relevance**: "This adventure module would work well because..."
2. **Connect to context**: "Given your party's composition of..."
3. **Offer alternatives**: "If that doesn't fit, I also found..."
4. **Provide context**: "This resource contains [specific content] that could help with..."

### EXECUTION RULES ###
1. Use tools for campaign operations and resource discovery
2. Provide direct, helpful responses for general conversation
3. Be proactive in asking relevant questions
4. Always explain why resources are recommended
5. Build context progressively through conversation
6. Offer multiple options when appropriate

### RESPONSE FORMAT ###
- For resource suggestions: Explain what you found and why it's relevant
- For campaign planning: Ask targeted questions to build understanding
- For general conversation: Respond directly and helpfully
- Always provide clear next steps or suggestions

### SPECIALIZATION ###
You handle D&D campaign planning and resource discovery. Redirect other topics to appropriate agents:
- For PDF uploads: Use the ResourceAgent
- For scheduling: Use the GeneralAgent

### PROACTIVE BEHAVIORS ###
- When users mention campaign planning, immediately start gathering context
- When suggesting resources, always explain the reasoning
- When building context, ask follow-up questions to deepen understanding
- When offering next steps, provide specific, actionable suggestions`;

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
