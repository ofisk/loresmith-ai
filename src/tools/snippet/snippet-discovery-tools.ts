import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../../middleware/auth";
import { SnippetAgent } from "../../agents/snippet-agent";

/**
 * Tool: Discover snippets for a campaign
 * Finds and returns snippets based on various criteria
 */
export const discoverSnippetsTool = tool({
  description:
    "Discover snippets for a campaign with optional filtering by status, resource, or type",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID to search for snippets"),
    status: z
      .enum(["staged", "approved", "rejected", "all"])
      .optional()
      .describe("Filter by snippet status (default: staged)"),
    resourceId: z
      .string()
      .optional()
      .describe("Optional: Filter by specific resource ID"),
    snippetType: z
      .string()
      .optional()
      .describe(
        "Optional: Filter by snippet type (e.g., 'monsters', 'spells', 'npcs')"
      ),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of snippets to return (default: 100)"),
  }),
  execute: async (
    { campaignId, status, resourceId, snippetType, limit },
    context?: any
  ) => {
    try {
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const snippetAgent = new SnippetAgent({} as any, env, {} as any);

      const result = await snippetAgent.discoverSnippets(campaignId, {
        status,
        resourceId,
        snippetType,
        limit,
      });

      return {
        success: true,
        data: {
          snippets: result.snippets,
          total: result.total,
          status: result.status,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },
});

/**
 * Tool: Search approved snippets
 * Searches through approved snippets for specific content
 */
export const searchApprovedSnippetsTool = tool({
  description:
    "Search through approved snippets in a campaign for specific content or keywords",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID to search in"),
    query: z.string().describe("Search query to find relevant snippets"),
  }),
  execute: async ({ campaignId, query }, context?: any) => {
    try {
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const snippetAgent = new SnippetAgent({} as any, env, {} as any);

      const result = await snippetAgent.searchApprovedSnippets(
        campaignId,
        query
      );

      return {
        success: true,
        data: {
          results: result.results,
          total: result.total,
          status: result.status,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },
});

/**
 * Tool: Get snippet statistics
 * Returns comprehensive statistics about snippets in a campaign
 */
export const getSnippetStatsTool = tool({
  description:
    "Get comprehensive statistics about snippets in a campaign including counts by status and type",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID to get statistics for"),
  }),
  execute: async ({ campaignId }, context?: any) => {
    try {
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const snippetAgent = new SnippetAgent({} as any, env, {} as any);

      const stats = await snippetAgent.getSnippetStats(campaignId);

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },
});
