import { tool } from "ai";
import { z } from "zod";
import { AUTH_CODES, type ToolResult } from "../../app-constants";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
} from "../utils";
import { CampaignAutoRAG } from "../../services/campaign-autorag-service";
import { getDAOFactory } from "../../dao/dao-factory";

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

      // If we have environment, use AutoRAG search
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

        // Verify campaign exists and belongs to user using DAO
        const campaignDAO = getDAOFactory(env).campaignDAO;
        const campaign = await campaignDAO.getCampaignByIdWithMapping(
          campaignId,
          userId
        );

        if (!campaign) {
          return createToolError(
            "Campaign not found",
            "Campaign not found",
            404,
            toolCallId
          );
        }

        // Use AutoRAG to search campaign content (includes approved shards and context)
        const basePath =
          campaign.campaignRagBasePath || `campaigns/${campaignId}`;
        const autoRAG = new CampaignAutoRAG(
          env,
          env.AUTORAG_BASE_URL,
          basePath
        );

        // Build search query with type filter if specified
        const searchQuery = query;
        const filters: any = {};

        if (searchType && searchType !== "all") {
          filters.entityType =
            searchType === "characters"
              ? "character"
              : searchType === "resources"
                ? "resource"
                : searchType === "context"
                  ? "context"
                  : searchType;
        }

        // Use AI search for better semantic understanding
        const searchResult = await autoRAG.aiSearch(searchQuery, {
          max_results: 20,
          filters:
            Object.keys(filters).length > 0
              ? {
                  key: "entityType",
                  type: "eq",
                  value: filters.entityType,
                }
              : undefined,
        });

        console.log(
          "[Tool] AutoRAG search results:",
          searchResult.data?.length || 0
        );

        // Transform AutoRAG AI search results to match expected format
        const results = (searchResult.data || []).map((item: any) => ({
          id: item.file_id,
          text: item.content?.[0]?.text || "",
          score: item.score,
          filename: item.filename,
          type: item.attributes?.entityType || "unknown",
          ...item.attributes,
        }));

        return createToolSuccess(
          `Found ${results.length} results for "${query}"${searchType && searchType !== "all" ? ` in ${searchType}` : ""}`,
          {
            query,
            searchType,
            results,
            totalCount: results.length,
          },
          toolCallId
        );
      }

      // Fallback: Environment not available, return error
      return createToolError(
        "Environment not available for campaign search",
        "Unable to access campaign data",
        500,
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

        // Verify campaign exists and belongs to user using DAO
        const campaignDAO = getDAOFactory(env).campaignDAO;
        const campaign = await campaignDAO.getCampaignByIdWithMapping(
          campaignId,
          userId
        );

        if (!campaign) {
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

      // Fallback: Environment not available, return error
      return createToolError(
        "Environment not available for external resource search",
        "Unable to access external resources",
        500,
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
