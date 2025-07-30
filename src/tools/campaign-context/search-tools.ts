import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, AUTH_CODES, type ToolResult } from "../../constants";
import { authenticatedFetch, handleAuthError } from "../../lib/toolAuth";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
} from "../utils";

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

// Tool to search campaign context for intelligent suggestions
export const searchCampaignContext = tool({
  description:
    "Search through stored campaign context, character information, and campaign notes to find relevant information for intelligent suggestions",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    query: z
      .string()
      .describe("The search query to find relevant campaign context"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of results to return (default: 5)"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, query, limit = 5, jwt },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] searchCampaignContext received:", {
      campaignId,
      query,
      limit,
    });
    console.log("[Tool] searchCampaignContext context:", context);
    try {
      // Check if we have access to the environment through context
      const env = getEnvFromContext(context);
      console.log("[searchCampaignContext] Environment from context:", !!env);
      console.log(
        "[searchCampaignContext] DB binding exists:",
        env?.DB !== undefined
      );

      if (env?.DB) {
        console.log(
          "[searchCampaignContext] Running in Durable Object context, calling database directly"
        );

        // Extract username from JWT
        const userId = extractUsernameFromJwt(jwt);
        console.log("[searchCampaignContext] User ID extracted:", userId);

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            AUTH_CODES.INVALID_KEY
          );
        }

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return createToolError("Campaign not found", "Campaign not found");
        }

        // Search campaign context using SQL LIKE for simple text matching
        // In a real implementation, this would use full-text search or vector search
        const searchQuery = `%${query}%`;
        const contextResult = await env.DB.prepare(
          "SELECT * FROM campaign_context WHERE campaign_id = ? AND (title LIKE ? OR content LIKE ?) ORDER BY created_at DESC LIMIT ?"
        )
          .bind(campaignId, searchQuery, searchQuery, limit)
          .all();

        console.log(
          "[searchCampaignContext] Found context entries:",
          contextResult.results?.length || 0
        );

        return createToolSuccess(
          `Found ${contextResult.results?.length || 0} relevant context entries for your query`,
          {
            results: contextResult.results || [],
            query,
            campaignId,
            limit,
          }
        );
      } else {
        // Fall back to HTTP API
        console.log(
          "[searchCampaignContext] Running in HTTP context, making API request"
        );
        const response = await authenticatedFetch(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.CONTEXT_SEARCH(campaignId)
          ),
          {
            method: "POST",
            jwt,
            body: JSON.stringify({
              query,
              limit,
            }),
          }
        );

        if (!response.ok) {
          const authError = handleAuthError(response);
          if (authError) {
            return createToolError(authError, null, AUTH_CODES.INVALID_KEY);
          }
          return createToolError(
            `Failed to search campaign context: ${response.status}`,
            `HTTP ${response.status}`
          );
        }

        const result = (await response.json()) as any;
        return createToolSuccess(
          `Found ${result.results?.length || 0} relevant context entries for your query`,
          result
        );
      }
    } catch (error) {
      console.error("Error searching campaign context:", error);
      return createToolError(
        `Failed to search campaign context: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  },
});
