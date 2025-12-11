import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, AUTH_CODES, type ToolResult } from "../../app-constants";
import { authenticatedFetch, handleAuthError } from "../../lib/tool-auth";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
} from "../utils";
import { CharacterEntitySyncService } from "@/services/campaign/character-entity-sync-service";

// Helper function to get environment from context
function getEnvFromContext(context: any): any {
  if (context?.env) {
    return context.env;
  }
  if (typeof globalThis !== "undefined" && "env" in globalThis) {
    return (globalThis as any).env;
  }
  return null;
}

// Tool to store campaign context (character backstories, world descriptions, etc.)
export const storeCampaignContext = tool({
  description:
    "Store campaign context information like character backstories, world descriptions, campaign notes, or session notes for intelligent suggestions",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    contextType: z
      .enum([
        "character_backstory",
        "world_description",
        "campaign_notes",
        "session_notes",
        "npc_description",
        "location_description",
        "plot_hooks",
        "player_preferences",
      ])
      .describe("The type of context being stored"),
    title: z.string().describe("A descriptive title for this context entry"),
    content: z
      .string()
      .describe(
        "The actual content to store (character backstory, world description, etc.)"
      ),
    metadata: z
      .record(z.any())
      .optional()
      .describe("Additional metadata for this context entry"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, contextType, title, content, metadata, jwt },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] storeCampaignContext received:", {
      campaignId,
      contextType,
      title,
      content: `${content.substring(0, 100)}...`,
    });
    console.log("[Tool] storeCampaignContext context:", context);

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[storeCampaignContext] Using toolCallId:", toolCallId);

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] storeCampaignContext - Environment found:", !!env);
      console.log("[Tool] storeCampaignContext - JWT provided:", !!jwt);
      console.log(
        "[Tool] storeCampaignContext - Context keys:",
        context ? Object.keys(context) : "no context"
      );
      console.log(
        "[Tool] storeCampaignContext - Environment keys:",
        env ? Object.keys(env) : "no env"
      );

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log("[Tool] storeCampaignContext - User ID extracted:", userId);

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            AUTH_CODES.INVALID_KEY,
            toolCallId
          );
        }

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return createToolError(
            "Campaign not found",
            "Campaign not found",
            AUTH_CODES.ERROR,
            toolCallId
          );
        }

        // Store the context
        const contextId = crypto.randomUUID();
        const now = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO campaign_context (id, campaign_id, context_type, title, content, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
          .bind(
            contextId,
            campaignId,
            contextType,
            title,
            content,
            metadata ? JSON.stringify(metadata) : null,
            now,
            now
          )
          .run();

        // Update campaign updated_at
        await env.DB.prepare("UPDATE campaigns SET updated_at = ? WHERE id = ?")
          .bind(now, campaignId)
          .run();

        // If this is a character_backstory, sync it to entities table
        if (contextType === "character_backstory") {
          try {
            const syncService = new CharacterEntitySyncService(env);
            await syncService.syncCharacterBackstoryToEntity(
              campaignId,
              contextId,
              title, // character name is stored as title
              content,
              metadata
            );
          } catch (syncError) {
            console.error(
              "[Tool] Failed to sync character_backstory to entities:",
              syncError
            );
            // Don't fail the context storage if sync fails
          }
        }

        console.log(
          "[Tool] Stored campaign context directly:",
          contextId,
          "type:",
          contextType
        );

        return createToolSuccess(
          `Successfully stored ${contextType} context: "${title}"`,
          {
            id: contextId,
            contextType,
            title,
            content,
            metadata,
            createdAt: now,
          },
          toolCallId
        );
      }

      // Otherwise, make HTTP request
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.CONTEXT(campaignId)),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            contextType,
            title,
            content,
            metadata,
          }),
        }
      );

      if (!response.ok) {
        const authError = handleAuthError(response);
        if (authError) {
          return createToolError(
            authError,
            null,
            AUTH_CODES.INVALID_KEY,
            toolCallId
          );
        }
        return createToolError(
          `Failed to store campaign context: ${response.status}`,
          `HTTP ${response.status}`,
          AUTH_CODES.ERROR,
          toolCallId
        );
      }
      const result = (await response.json()) as any;
      return createToolSuccess(
        `Successfully stored ${contextType} context: "${title}"`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error storing campaign context:", error);
      return createToolError(
        `Failed to store campaign context: ${error instanceof Error ? error.message : String(error)}`,
        error,
        AUTH_CODES.ERROR,
        toolCallId
      );
    }
  },
});

// Tool to retrieve stored campaign context
export const getCampaignContext = tool({
  description:
    "Retrieve stored campaign context to provide intelligent suggestions and recommendations",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    contextType: z
      .enum([
        "character_backstory",
        "world_description",
        "campaign_notes",
        "session_notes",
        "npc_description",
        "location_description",
        "plot_hooks",
        "player_preferences",
        "all",
      ])
      .optional()
      .describe("The type of context to retrieve (default: all)"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, contextType = "all", jwt },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] getCampaignContext received:", {
      campaignId,
      contextType,
    });
    console.log("[Tool] getCampaignContext context:", context);

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[getCampaignContext] Using toolCallId:", toolCallId);

    try {
      // Check if we have access to the environment through context
      const env = getEnvFromContext(context);
      console.log("[getCampaignContext] Environment from context:", !!env);
      console.log(
        "[getCampaignContext] DB binding exists:",
        env?.DB !== undefined
      );

      if (env?.DB) {
        console.log(
          "[getCampaignContext] Running in Durable Object context, calling database directly"
        );

        // Extract username from JWT
        const userId = extractUsernameFromJwt(jwt);
        console.log("[getCampaignContext] User ID extracted:", userId);

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            AUTH_CODES.INVALID_KEY,
            toolCallId
          );
        }

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return createToolError(
            "Campaign not found",
            "Campaign not found",
            AUTH_CODES.ERROR,
            toolCallId
          );
        }

        // Query campaign context
        let query = "SELECT * FROM campaign_context WHERE campaign_id = ?";
        const params = [campaignId];

        if (contextType !== "all") {
          query += " AND context_type = ?";
          params.push(contextType);
        }

        query += " ORDER BY created_at DESC";

        const contextResult = await env.DB.prepare(query)
          .bind(...params)
          .all();

        // If retrieving character_backstory entries, ensure they're synced to entities
        if (contextType === "all" || contextType === "character_backstory") {
          try {
            const syncService = new CharacterEntitySyncService(env);
            await syncService.syncAllCharacterBackstories(campaignId);
          } catch (syncError) {
            console.error(
              "[getCampaignContext] Failed to sync character_backstory entries:",
              syncError
            );
            // Don't fail the retrieval if sync fails
          }
        }

        console.log(
          "[getCampaignContext] Retrieved context entries:",
          contextResult.results?.length || 0
        );

        return createToolSuccess(
          `Retrieved ${contextResult.results?.length || 0} context entries for campaign`,
          {
            context: contextResult.results || [],
            campaignId,
            contextType,
          },
          toolCallId
        );
      } else {
        // Fall back to HTTP API
        console.log(
          "[getCampaignContext] Running in HTTP context, making API request"
        );
        const url =
          contextType === "all"
            ? API_CONFIG.buildUrl(
                API_CONFIG.ENDPOINTS.CAMPAIGNS.CONTEXT(campaignId)
              )
            : API_CONFIG.buildUrl(
                API_CONFIG.ENDPOINTS.CAMPAIGNS.CONTEXT(campaignId) +
                  `?type=${contextType}`
              );

        const response = await authenticatedFetch(url, {
          method: "GET",
          jwt,
        });

        if (!response.ok) {
          const authError = handleAuthError(response);
          if (authError) {
            return createToolError(
              authError,
              null,
              AUTH_CODES.INVALID_KEY,
              toolCallId
            );
          }
          return createToolError(
            `Failed to retrieve campaign context: ${response.status}`,
            `HTTP ${response.status}`,
            AUTH_CODES.ERROR,
            toolCallId
          );
        }

        const result = (await response.json()) as any;
        return createToolSuccess(
          `Retrieved ${result.context?.length || 0} context entries for campaign`,
          result,
          toolCallId
        );
      }
    } catch (error) {
      console.error("Error retrieving campaign context:", error);
      return createToolError(
        `Failed to retrieve campaign context: ${error instanceof Error ? error.message : String(error)}`,
        error,
        AUTH_CODES.ERROR,
        toolCallId
      );
    }
  },
});
