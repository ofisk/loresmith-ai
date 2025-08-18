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

// Tool to search campaign context
export const searchCampaignContext = tool({
  description:
    "Search through campaign context, characters, and resources to find relevant information",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    query: z.string().describe("The search query"),
    searchType: z
      .enum(["all", "characters", "resources", "context"])
      .optional()
      .describe("Type of content to search (default: all)"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, query, searchType = "all", jwt },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[searchCampaignContext] Using toolCallId:", toolCallId);

    console.log("[Tool] searchCampaignContext received:", {
      campaignId,
      query,
      searchType,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] searchCampaignContext - Environment found:", !!env);
      console.log("[Tool] searchCampaignContext - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log(
          "[Tool] searchCampaignContext - User ID extracted:",
          userId
        );

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
            404,
            toolCallId
          );
        }

        // Perform search based on type
        const results = [];
        const searchQuery = `%${query}%`;

        if (searchType === "all" || searchType === "characters") {
          const characters = await env.DB.prepare(
            "SELECT * FROM campaign_characters WHERE campaign_id = ? AND (character_name LIKE ? OR backstory LIKE ? OR personality_traits LIKE ? OR goals LIKE ?)"
          )
            .bind(
              campaignId,
              searchQuery,
              searchQuery,
              searchQuery,
              searchQuery
            )
            .all();
          results.push(
            ...characters.results.map((c: any) => ({ ...c, type: "character" }))
          );
        }

        if (searchType === "all" || searchType === "resources") {
          const resources = await env.DB.prepare(
            "SELECT * FROM campaign_resources WHERE campaign_id = ? AND (name LIKE ? OR description LIKE ? OR content LIKE ?)"
          )
            .bind(campaignId, searchQuery, searchQuery, searchQuery)
            .all();
          results.push(
            ...resources.results.map((r: any) => ({ ...r, type: "resource" }))
          );
        }

        if (searchType === "all" || searchType === "context") {
          const context = await env.DB.prepare(
            "SELECT * FROM campaign_context WHERE campaign_id = ? AND (title LIKE ? OR content LIKE ?)"
          )
            .bind(campaignId, searchQuery, searchQuery)
            .all();
          results.push(
            ...context.results.map((c: any) => ({ ...c, type: "context" }))
          );
        }

        console.log("[Tool] Search results:", results.length);

        return createToolSuccess(
          `Found ${results.length} results for "${query}"`,
          {
            query,
            searchType,
            results,
            totalCount: results.length,
          },
          toolCallId
        );
      }

      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CONTEXT_SEARCH(campaignId)
        ),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            query,
            searchType,
          }),
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(
            authError,
            null,
            AUTH_CODES.INVALID_KEY,
            toolCallId
          );
        }
        return createToolError(
          "Failed to search campaign context",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = await response.json();
      return createToolSuccess(
        `Found ${(result as any).results?.length || 0} results for "${query}"`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error searching campaign context:", error);
      return createToolError(
        "Failed to search campaign context",
        error,
        500,
        toolCallId
      );
    }
  },
});

// Tool to search external resources
export const searchExternalResources = tool({
  description:
    "Search for external resources and references that might be relevant to the campaign",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    query: z.string().describe("The search query for external resources"),
    resourceType: z
      .enum(["adventures", "maps", "characters", "monsters", "items"])
      .optional()
      .describe("Type of external resource to search for"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, query, resourceType, jwt },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[searchExternalResources] Using toolCallId:", toolCallId);

    console.log("[Tool] searchExternalResources received:", {
      campaignId,
      query,
      resourceType,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] searchExternalResources - Environment found:", !!env);
      console.log("[Tool] searchExternalResources - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log(
          "[Tool] searchExternalResources - User ID extracted:",
          userId
        );

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
            404,
            toolCallId
          );
        }

        // For now, return mock external resource suggestions
        // In a real implementation, this would search external APIs or databases
        const mockResults = [
          {
            title: `D&D ${resourceType || "adventure"} for "${query}"`,
            url: `https://dmsguild.com/search?q=${encodeURIComponent(query)}`,
            description: `Find ${resourceType || "adventure"} content related to "${query}"`,
            type: resourceType || "adventure",
            relevance: "high",
          },
          {
            title: `Reddit discussion about "${query}"`,
            url: `https://reddit.com/r/DMAcademy/search?q=${encodeURIComponent(query)}`,
            description: `Community discussions and advice about "${query}"`,
            type: "discussion",
            relevance: "medium",
          },
        ];

        console.log("[Tool] External search results:", mockResults.length);

        return createToolSuccess(
          `Found ${mockResults.length} external resources for "${query}"`,
          {
            query,
            resourceType,
            results: mockResults,
            totalCount: mockResults.length,
          },
          toolCallId
        );
      }

      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CONTEXT_SEARCH(campaignId)
        ),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            query,
            searchType: "external",
            resourceType,
          }),
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(
            authError,
            null,
            AUTH_CODES.INVALID_KEY,
            toolCallId
          );
        }
        return createToolError(
          "Failed to search external resources",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = await response.json();
      return createToolSuccess(
        `Found ${(result as any).results?.length || 0} external resources for "${query}"`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error searching external resources:", error);
      return createToolError(
        "Failed to search external resources",
        error,
        500,
        toolCallId
      );
    }
  },
});
