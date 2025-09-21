import { tool } from "ai";
import { z } from "zod";
import { ShardAgent } from "../../agents/shard-agent";
import { getDAOFactory } from "../../dao/dao-factory";
import {
  notifyShardApproval,
  notifyShardRejection,
} from "../../lib/notifications";
import type { Env } from "../../middleware/auth";

/**
 * Tool: Approve shards
 * Approves selected shards by moving them from staged to approved status
 */
export const approveShardsTool = tool({
  description:
    "Approve selected shards by moving them from staged to approved status",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The campaign ID containing the shards to approve"),
    shardIds: z.array(z.string()).describe("Array of shard IDs to approve"),
  }),
  execute: async ({ campaignId, shardIds }, context?: any) => {
    try {
      console.log("[approveShardsTool] called:", {
        campaignId,
        count: shardIds?.length,
      });
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const shardAgent = new ShardAgent({} as any, env, {} as any);

      const result = await shardAgent.approveShards(campaignId, shardIds);

      // Send notification about shard approval
      if (result.approved > 0) {
        try {
          const campaignDAO = getDAOFactory(env).campaignDAO;
          const campaign = await campaignDAO.getCampaignById(campaignId);

          if (campaign) {
            // Get username from context or extract from JWT
            const username = context?.username || "unknown";
            await notifyShardApproval(
              env,
              username,
              campaign.name,
              result.approved
            );
          }
        } catch (error) {
          console.error(
            "[approveShardsTool] Failed to send approval notification:",
            error
          );
        }
      }

      // Prefer rendering updated UI rather than returning prose
      const payload = {
        success: true,
        data: {
          type: "render_component",
          component: "ShardManagementUI",
          props: {
            campaignId,
            action: "show_staged",
          },
          // Keep a machine-readable summary if needed by logs/debug
          meta: {
            approved: result.approved,
            status: result.status,
          },
        },
      };
      console.log(
        "[approveShardsTool] returning render_component payload",
        payload.data?.meta
      );
      return payload;
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
 * Tool: Reject shards
 * Rejects selected shards by moving them from staged to rejected status
 */
export const rejectShardsTool = tool({
  description:
    "Reject selected shards by moving them from staged to rejected status with a reason",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The campaign ID containing the shards to reject"),
    shardIds: z.array(z.string()).describe("Array of shard IDs to reject"),
    reason: z.string().describe("Reason for rejecting these shards"),
  }),
  execute: async ({ campaignId, shardIds, reason }, context?: any) => {
    try {
      console.log("[rejectShardsTool] called:", {
        campaignId,
        count: shardIds?.length,
        reason,
      });
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const shardAgent = new ShardAgent({} as any, env, {} as any);

      const result = await shardAgent.rejectShards(
        campaignId,
        shardIds,
        reason
      );

      // Send notification about shard rejection
      if (result.rejected > 0) {
        try {
          const campaignDAO = getDAOFactory(env).campaignDAO;
          const campaign = await campaignDAO.getCampaignById(campaignId);

          if (campaign) {
            // Get username from context or extract from JWT
            const username = context?.username || "unknown";
            await notifyShardRejection(
              env,
              username,
              campaign.name,
              result.rejected,
              reason
            );
          }
        } catch (error) {
          console.error(
            "[rejectShardsTool] Failed to send rejection notification:",
            error
          );
        }
      }

      // Prefer rendering updated UI rather than returning prose
      const payload = {
        success: true,
        data: {
          type: "render_component",
          component: "ShardManagementUI",
          props: {
            campaignId,
            action: "show_staged",
          },
          meta: {
            rejected: result.rejected,
            status: result.status,
            reason,
          },
        },
      };
      console.log(
        "[rejectShardsTool] returning render_component payload",
        payload.data?.meta
      );
      return payload;
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
 * Tool: Create shards from AI response
 * Creates new shards from an AI response and stores them in the database
 */
export const createShardsTool = tool({
  description:
    "Create new shards from an AI response and store them in the database",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID to create shards for"),
    resourceId: z
      .string()
      .describe("The resource ID that the shards are derived from"),
    resourceName: z.string().optional().describe("The name of the resource"),
    aiResponse: z
      .any()
      .describe(
        "The AI response containing structured content to parse into shards"
      ),
  }),
  execute: async (
    { campaignId, resourceId, resourceName, aiResponse },
    context?: any
  ) => {
    try {
      console.log("[createShardsTool] execute called:", {
        campaignId,
        resourceId,
        hasAI: Boolean(aiResponse),
      });
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const shardAgent = new ShardAgent({} as any, env, {} as any);

      // Create resource object for the agent
      const resource = {
        id: resourceId,
        name: resourceName || resourceId,
      };

      const result = await shardAgent.createShards(
        aiResponse,
        resource,
        campaignId
      );

      console.log(
        "[createShardsTool] result:",
        result?.status,
        result?.created
      );
      // Hint UI to show staged shards immediately
      return {
        success: true,
        data: {
          type: "render_component",
          component: "ShardManagementUI",
          props: {
            campaignId,
            action: "show_staged",
            resourceId,
          },
          meta: {
            created: result.created,
            status: result.status,
          },
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
 * Tool: Get shard details
 * Retrieves detailed information about specific shards
 */
export const getShardDetailsTool = tool({
  description: "Get detailed information about specific shards by their IDs",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID containing the shards"),
    shardIds: z
      .array(z.string())
      .describe("Array of shard IDs to get details for"),
  }),
  execute: async ({ campaignId, shardIds }, context?: any) => {
    try {
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const shardAgent = new ShardAgent({} as any, env, {} as any);

      // Get all shards for the campaign and filter by IDs
      const result = await shardAgent.discoverShards(campaignId, {
        status: "all",
      });

      // Filter shards by the requested IDs
      const requestedShards = result.shards.flatMap((group: any) =>
        group.shards.filter((shard: any) => shardIds.includes(shard.id))
      );

      return {
        success: true,
        data: {
          shards: requestedShards,
          total: requestedShards.length,
          requestedIds: shardIds,
          foundIds: requestedShards.map((s: any) => s.id),
          status: "success",
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
