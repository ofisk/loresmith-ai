import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../../middleware/auth";
import { SnippetAgent } from "../../agents/snippet-agent";

/**
 * Tool: Approve snippets
 * Approves selected snippets by moving them from staged to approved status
 */
export const approveSnippetsTool = tool({
  description:
    "Approve selected snippets by moving them from staged to approved status",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The campaign ID containing the snippets to approve"),
    snippetIds: z.array(z.string()).describe("Array of snippet IDs to approve"),
  }),
  execute: async ({ campaignId, snippetIds }, context?: any) => {
    try {
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const snippetAgent = new SnippetAgent({} as any, env, {} as any);

      const result = await snippetAgent.approveSnippets(campaignId, snippetIds);

      return {
        success: true,
        data: {
          approved: result.approved,
          status: result.status,
          message: `Successfully approved ${result.approved} snippets`,
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
 * Tool: Reject snippets
 * Rejects selected snippets by moving them from staged to rejected status
 */
export const rejectSnippetsTool = tool({
  description:
    "Reject selected snippets by moving them from staged to rejected status with a reason",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The campaign ID containing the snippets to reject"),
    snippetIds: z.array(z.string()).describe("Array of snippet IDs to reject"),
    reason: z.string().describe("Reason for rejecting these snippets"),
  }),
  execute: async ({ campaignId, snippetIds, reason }, context?: any) => {
    try {
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const snippetAgent = new SnippetAgent({} as any, env, {} as any);

      const result = await snippetAgent.rejectSnippets(
        campaignId,
        snippetIds,
        reason
      );

      return {
        success: true,
        data: {
          rejected: result.rejected,
          status: result.status,
          reason,
          message: `Successfully rejected ${result.rejected} snippets`,
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
 * Tool: Create snippets from AI response
 * Creates new snippets from an AI response and stores them in the database
 */
export const createSnippetsTool = tool({
  description:
    "Create new snippets from an AI response and store them in the database",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID to create snippets for"),
    resourceId: z
      .string()
      .describe("The resource ID that the snippets are derived from"),
    resourceName: z.string().optional().describe("The name of the resource"),
    aiResponse: z
      .any()
      .describe(
        "The AI response containing structured content to parse into snippets"
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

      const snippetAgent = new SnippetAgent({} as any, env, {} as any);

      // Create resource object for the agent
      const resource = {
        id: resourceId,
        name: resourceName || resourceId,
      };

      const result = await snippetAgent.createSnippets(
        aiResponse,
        resource,
        campaignId
      );

      return {
        success: true,
        data: {
          created: result.created,
          snippets: result.snippets,
          status: result.status,
          message: `Successfully created ${result.created} snippets from ${resourceName || resourceId}`,
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
 * Tool: Get snippet details
 * Retrieves detailed information about specific snippets
 */
export const getSnippetDetailsTool = tool({
  description: "Get detailed information about specific snippets by their IDs",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID containing the snippets"),
    snippetIds: z
      .array(z.string())
      .describe("Array of snippet IDs to get details for"),
  }),
  execute: async ({ campaignId, snippetIds }, context?: any) => {
    try {
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const snippetAgent = new SnippetAgent({} as any, env, {} as any);

      // Get all snippets for the campaign and filter by IDs
      const result = await snippetAgent.discoverSnippets(campaignId, {
        status: "all",
      });

      // Filter snippets by the requested IDs
      const requestedSnippets = result.snippets.flatMap((group) =>
        group.snippets.filter((snippet) => snippetIds.includes(snippet.id))
      );

      return {
        success: true,
        data: {
          snippets: requestedSnippets,
          total: requestedSnippets.length,
          requestedIds: snippetIds,
          foundIds: requestedSnippets.map((s) => s.id),
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
