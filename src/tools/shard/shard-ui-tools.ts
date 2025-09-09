import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../../middleware/auth";
import { ShardAgent } from "../../agents/shard-agent";

/**
 * Tool: Render shard management UI in chat
 * Displays the shard management interface directly in the chat for user interaction
 */
export const renderShardManagementUITool = tool({
  description:
    "Render the shard management interface in the chat for users to approve/reject shards",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID to manage shards for"),
    action: z
      .enum(["show_staged", "show_approved", "show_rejected", "show_all"])
      .describe("What type of shards to display"),
    resourceId: z
      .string()
      .optional()
      .describe("Optional: Filter by specific resource ID"),
    shardType: z.string().optional().describe("Optional: Filter by shard type"),
  }),
  execute: async (
    { campaignId, action, resourceId, shardType },
    context?: any
  ) => {
    try {
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const shardAgent = new ShardAgent({} as any, env, {} as any);

      // Get shards based on the requested action
      let status: "staged" | "approved" | "rejected" | "all" = "staged";
      if (action === "show_approved") status = "approved";
      else if (action === "show_rejected") status = "rejected";
      else if (action === "show_all") status = "all";

      const result = await shardAgent.discoverShards(campaignId, {
        status,
        resourceId,
        shardType,
      });

      // Return a special response that the UI will recognize as a component render request
      return {
        success: true,
        data: {
          type: "render_component",
          component: "ShardManagementUI",
          props: {
            campaignId,
            shards: result.shards,
            total: result.total,
            status: result.status,
            action,
            resourceId,
            shardType,
          },
          message: `Found ${result.total} shards for campaign ${campaignId}. Here's the management interface:`,
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
 * Tool: Render shard approval interface in chat
 * Shows a focused interface for approving specific shards
 */
export const renderShardApprovalUITool = tool({
  description: "Render a focused shard approval interface in the chat",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID containing the shards"),
    shardIds: z
      .array(z.string())
      .describe("Array of shard IDs to show for approval"),
    reason: z
      .string()
      .optional()
      .describe("Optional: Context or reason for this approval batch"),
  }),
  execute: async ({ campaignId, shardIds, reason }, context?: any) => {
    try {
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const shardAgent = new ShardAgent({} as any, env, {} as any);

      // Get details for the specific shards
      const result = await shardAgent.discoverShards(campaignId, {
        status: "all",
      });

      // Filter to only the requested shards
      const requestedShards = result.shards.flatMap((group: any) =>
        group.shards.filter((shard: any) => shardIds.includes(shard.id))
      );

      return {
        success: true,
        data: {
          type: "render_component",
          component: "ShardApprovalUI",
          props: {
            campaignId,
            shards: requestedShards,
            shardIds,
            reason,
            total: requestedShards.length,
          },
          message: `Ready to approve ${requestedShards.length} shards. Here's the approval interface:`,
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
