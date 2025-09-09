import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../../middleware/auth";
import { ShardAgent } from "../../agents/shard-agent";

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
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const shardAgent = new ShardAgent({} as any, env, {} as any);

      const result = await shardAgent.approveShards(campaignId, shardIds);

      return {
        success: true,
        data: {
          approved: result.approved,
          status: result.status,
          message: `Successfully approved ${result.approved} shards`,
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

      return {
        success: true,
        data: {
          rejected: result.rejected,
          status: result.status,
          reason,
          message: `Successfully rejected ${result.rejected} shards`,
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

      return {
        success: true,
        data: {
          created: result.created,
          shards: result.shards,
          status: result.status,
          message: `Successfully created ${result.created} shards from ${resourceName || resourceId}`,
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
