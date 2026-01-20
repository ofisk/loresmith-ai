import { tool } from "ai";
import { z } from "zod";
import {
  commonSchemas,
  createToolSuccess,
  createToolError,
  extractUsernameFromJwt,
} from "../utils";
import { getDAOFactory } from "../../dao/dao-factory";
import { AUTH_CODES } from "../../shared-config";
import { CHECKLIST_ITEM_NAMES } from "../../constants/checklist-items";

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

/**
 * Get checklist status for a campaign
 * Returns structured status and summaries for all tracked checklist items
 */
export const getChecklistStatusTool = tool({
  description:
    "Get the current status and summaries for all campaign planning checklist items. This provides a quick, structured view of what's been completed, what's incomplete, and brief summaries of what exists for each item. Use this instead of doing multiple broad searches when checking what checklist items are already established. IMPORTANT: Status marked as 'partial' with 'Preliminary:' summaries are based on entity counts only - you should investigate further using searchCampaignContext to verify if items are truly complete (e.g., factions may exist but not be well-defined or integrated into the campaign).",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ campaignId, jwt }, context?: any): Promise<any> => {
    const toolCallId = crypto.randomUUID();

    try {
      const env = getEnvFromContext(context);
      if (!env) {
        return createToolError(
          "Environment not available",
          "Server environment is required",
          500,
          toolCallId
        );
      }

      const userId = extractUsernameFromJwt(jwt as string | null | undefined);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          AUTH_CODES.INVALID_KEY,
          toolCallId
        );
      }

      const daoFactory = getDAOFactory(env);
      const campaignDAO = daoFactory.campaignDAO;
      const checklistStatusDAO = daoFactory.checklistStatusDAO;

      // Verify campaign access
      const campaign = await campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );
      if (!campaign) {
        return createToolError(
          "Campaign not found or access denied",
          `Campaign ${campaignId} not found for user ${userId}`,
          404,
          toolCallId
        );
      }

      // Get all checklist status records
      const statusRecords = await checklistStatusDAO.getChecklistStatus(
        campaignId as string
      );

      // Format results for the agent
      const statusByItem: Record<
        string,
        { status: string; summary: string | null }
      > = {};
      for (const record of statusRecords) {
        statusByItem[record.checklistItemKey] = {
          status: record.status,
          summary: record.summary,
        };
      }

      // Build a readable summary
      const completeItems: string[] = [];
      const incompleteItems: string[] = [];
      const partialItems: string[] = [];

      for (const record of statusRecords) {
        const itemName =
          CHECKLIST_ITEM_NAMES[record.checklistItemKey] ||
          record.checklistItemKey;
        const itemInfo = `${itemName}${record.summary ? `: ${record.summary}` : ""}`;

        if (record.status === "complete") {
          completeItems.push(itemInfo);
        } else if (record.status === "partial") {
          partialItems.push(itemInfo);
        } else {
          incompleteItems.push(itemInfo);
        }
      }

      const summaryText = `Checklist Status for Campaign:

COMPLETE (${completeItems.length}):
${completeItems.length > 0 ? completeItems.map((i) => `- ${i}`).join("\n") : "None"}

PARTIAL (${partialItems.length}):
${partialItems.length > 0 ? partialItems.map((i) => `- ${i}`).join("\n") : "None"}

INCOMPLETE (${incompleteItems.length}):
${incompleteItems.length > 0 ? incompleteItems.map((i) => `- ${i}`).join("\n") : "None"}

Total tracked items: ${statusRecords.length}`;

      return createToolSuccess(
        summaryText,
        {
          statusByItem,
          completeCount: completeItems.length,
          partialCount: partialItems.length,
          incompleteCount: incompleteItems.length,
          totalCount: statusRecords.length,
        },
        toolCallId
      );
    } catch (error) {
      console.error("[getChecklistStatusTool] Error:", error);
      return createToolError(
        "Failed to get checklist status",
        error instanceof Error ? error.message : String(error),
        500,
        toolCallId
      );
    }
  },
});
