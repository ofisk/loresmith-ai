import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../../middleware/auth";
import { SnippetAgent } from "../../agents/snippet-agent";

/**
 * Tool: Render snippet management UI in chat
 * Displays the snippet management interface directly in the chat for user interaction
 */
export const renderSnippetManagementUITool = tool({
  description:
    "Render the snippet management interface in the chat for users to approve/reject snippets",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID to manage snippets for"),
    action: z
      .enum(["show_staged", "show_approved", "show_rejected", "show_all"])
      .describe("What type of snippets to display"),
    resourceId: z
      .string()
      .optional()
      .describe("Optional: Filter by specific resource ID"),
    snippetType: z
      .string()
      .optional()
      .describe("Optional: Filter by snippet type"),
  }),
  execute: async (
    { campaignId, action, resourceId, snippetType },
    context?: any
  ) => {
    try {
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const snippetAgent = new SnippetAgent({} as any, env, {} as any);

      // Get snippets based on the requested action
      let status: "staged" | "approved" | "rejected" | "all" = "staged";
      if (action === "show_approved") status = "approved";
      else if (action === "show_rejected") status = "rejected";
      else if (action === "show_all") status = "all";

      const result = await snippetAgent.discoverSnippets(campaignId, {
        status,
        resourceId,
        snippetType,
      });

      // Return a special response that the UI will recognize as a component render request
      return {
        success: true,
        data: {
          type: "render_component",
          component: "SnippetManagementUI",
          props: {
            campaignId,
            snippets: result.snippets,
            total: result.total,
            status: result.status,
            action,
            resourceId,
            snippetType,
          },
          message: `Found ${result.total} snippets for campaign ${campaignId}. Here's the management interface:`,
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
 * Tool: Render snippet approval interface in chat
 * Shows a focused interface for approving specific snippets
 */
export const renderSnippetApprovalUITool = tool({
  description: "Render a focused snippet approval interface in the chat",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID containing the snippets"),
    snippetIds: z
      .array(z.string())
      .describe("Array of snippet IDs to show for approval"),
    reason: z
      .string()
      .optional()
      .describe("Optional: Context or reason for this approval batch"),
  }),
  execute: async ({ campaignId, snippetIds, reason }, context?: any) => {
    try {
      const env = context?.env as Env;
      if (!env) {
        throw new Error("Environment not available");
      }

      const snippetAgent = new SnippetAgent({} as any, env, {} as any);

      // Get details for the specific snippets
      const result = await snippetAgent.discoverSnippets(campaignId, {
        status: "all",
      });

      // Filter to only the requested snippets
      const requestedSnippets = result.snippets.flatMap((group) =>
        group.snippets.filter((snippet) => snippetIds.includes(snippet.id))
      );

      return {
        success: true,
        data: {
          type: "render_component",
          component: "SnippetApprovalUI",
          props: {
            campaignId,
            snippets: requestedSnippets,
            snippetIds,
            reason,
            total: requestedSnippets.length,
          },
          message: `Ready to approve ${requestedSnippets.length} snippets. Here's the approval interface:`,
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
