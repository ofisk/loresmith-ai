import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../../middleware/auth";
import { ShardAgent } from "../../agents/shard-agent";

/**
 * Tool: Discover shards for a campaign
 * Finds and returns shards based on various criteria
 */
export const discoverShardsTool = tool({
  description:
    "Discover shards for a campaign with optional filtering by status, resource, or type",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID to search for shards"),
    status: z
      .enum(["staged", "approved", "rejected", "all"])
      .optional()
      .describe("Filter by shard status (default: staged)"),
    resourceId: z
      .string()
      .optional()
      .describe("Optional: Filter by specific resource ID"),
    shardType: z
      .string()
      .optional()
      .describe(
        "Optional: Filter by shard type (e.g., 'monsters', 'spells', 'npcs')"
      ),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of shards to return (default: 100)"),
  }),
  execute: async (
    { campaignId, status, resourceId, shardType, limit },
    context?: any
  ) => {
    try {
      console.log(
        `[discoverShardsTool] DEBUG: Called with campaignId: "${campaignId}"`
      );
      console.log(
        `[discoverShardsTool] DEBUG: Status: ${status}, ResourceId: ${resourceId}, ShardType: ${shardType}, Limit: ${limit}`
      );

      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const shardAgent = new ShardAgent({} as any, env, {} as any);

      const result = await shardAgent.discoverShards(campaignId, {
        status,
        resourceId,
        shardType,
        limit,
      });

      console.log(`[discoverShardsTool] DEBUG: Result:`, result);

      return {
        success: true,
        data: {
          shards: result.shards,
          total: result.total,
          status: result.status,
        },
      };
    } catch (error) {
      console.error(`[discoverShardsTool] DEBUG: Error:`, error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },
});

/**
 * Tool: Search approved shards
 * Searches through approved shards for specific content
 */
export const searchApprovedShardsTool = tool({
  description:
    "Search through approved shards in a campaign for specific content or keywords",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID to search in"),
    query: z.string().describe("Search query to find relevant shards"),
  }),
  execute: async ({ campaignId, query }, context?: any) => {
    try {
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const shardAgent = new ShardAgent({} as any, env, {} as any);

      const result = await shardAgent.searchApprovedShards(campaignId, query);

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
 * Tool: Get shard statistics
 * Returns comprehensive statistics about shards in a campaign
 */
export const getShardStatsTool = tool({
  description:
    "Get comprehensive statistics about shards in a campaign including counts by status and type",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID to get statistics for"),
  }),
  execute: async ({ campaignId }, context?: any) => {
    try {
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const shardAgent = new ShardAgent({} as any, env, {} as any);

      const stats = await shardAgent.getShardStats(campaignId);

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

/**
 * Tool: Get all campaigns for the user
 * Returns all campaigns to help identify the correct campaign name
 */
export const getAllCampaignsTool = tool({
  description:
    "Get all campaigns for the user to help identify the correct campaign name when shards are not found",
  parameters: z.object({}),
  execute: async (_, context?: any) => {
    try {
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      // Get all campaigns directly from database
      const campaigns = await env.DB.prepare(
        "SELECT id, name, username FROM campaigns ORDER BY created_at DESC"
      ).all();

      return {
        success: true,
        data: {
          campaigns: campaigns.results || [],
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
 * Tool: Extract campaign name from message
 * Looks for campaign name in user messages and resolves it to campaign ID
 */
export const extractCampaignNameFromMessageTool = tool({
  description:
    "Extract campaign name from user messages (format: Campaign: name) and resolve to campaign ID",
  parameters: z.object({
    message: z
      .string()
      .describe("The user message to extract campaign name from"),
  }),
  execute: async ({ message }, context?: any) => {
    try {
      console.log(
        "[extractCampaignNameFromMessageTool] Extracting from message:",
        message
      );

      // Look for "Campaign: " followed by a campaign name
      const campaignNameMatch = message.match(/Campaign:\s*([^.!?]+)/i);
      const campaignName = campaignNameMatch
        ? campaignNameMatch[1].trim()
        : null;

      console.log(
        "[extractCampaignNameFromMessageTool] Extracted campaign name:",
        campaignName
      );

      if (!campaignName) {
        return {
          success: true,
          data: {
            campaignName: null,
            campaignId: null,
            found: false,
          },
        };
      }

      // Resolve campaign name to campaign ID
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      // Get all campaigns to find the matching one
      const campaigns = await env.DB.prepare(
        "SELECT id, name FROM campaigns WHERE name = ?"
      )
        .bind(campaignName)
        .all();

      const campaign = campaigns.results?.[0] as
        | { id: string; name: string }
        | undefined;
      const campaignId = campaign?.id || null;

      console.log(
        "[extractCampaignNameFromMessageTool] Resolved campaign ID:",
        campaignId
      );

      return {
        success: true,
        data: {
          campaignName,
          campaignId,
          found: !!campaignId,
        },
      };
    } catch (error) {
      console.error("[extractCampaignNameFromMessageTool] Error:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },
});

/**
 * Tool: Debug all shards in database
 * Returns all shards in the database for troubleshooting
 */
export const debugAllShardsTool = tool({
  description:
    "DEBUG: Get all shards in the database for troubleshooting shard retrieval issues",
  parameters: z.object({}),
  execute: async (_, context?: any) => {
    try {
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const { getDAOFactory } = await import("../../dao/dao-factory");
      const stagedShardsDAO = getDAOFactory(env).stagedShardsDAO;
      const allShards = await stagedShardsDAO.getAllShards();

      return {
        success: true,
        data: {
          totalShards: allShards.length,
          shards: allShards,
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
