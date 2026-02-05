import { tool } from "ai";
import { z } from "zod";
import type { ToolResult } from "../../app-constants";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  getEnvFromContext,
  type ToolExecuteOptions,
} from "../utils";
import { RecapService } from "../../services/core/recap-service";

const generateContextRecapSchema = z.object({
  campaignId: commonSchemas.campaignId,
  jwt: commonSchemas.jwt,
  sinceTimestamp: z
    .string()
    .optional()
    .describe(
      "ISO timestamp string to get data since (defaults to 1 hour ago)"
    ),
});

/**
 * Tool to generate context recap data for a campaign
 * Returns recent activity, world state changes, session digests, and in-progress goals
 */
export const generateContextRecapTool = tool({
  description:
    "Generate a context recap for a campaign summarizing recent activity, world state changes, session digests, and in-progress goals. Use this when a user returns to the app after being away or when they switch campaigns.",
  inputSchema: generateContextRecapSchema,
  execute: async (
    input: z.infer<typeof generateContextRecapSchema>,
    options: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, jwt, sinceTimestamp } = input;
    const toolCallId = options?.toolCallId ?? crypto.randomUUID();

    try {
      if (!jwt) {
        return createToolError(
          "Authentication required",
          "JWT token is required",
          401,
          toolCallId
        );
      }

      const env = getEnvFromContext(options);
      if (!env) {
        return createToolError(
          "Environment not available",
          "Server environment is required",
          500,
          toolCallId
        );
      }

      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      // Verify campaign exists and belongs to user
      const { getDAOFactory } = await import("../../dao/dao-factory");
      const daoFactory = getDAOFactory(env);
      const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found or access denied",
          404,
          toolCallId
        );
      }

      // Get recap data
      const recapService = new RecapService(
        env as import("@/middleware/auth").Env
      );
      const recapData = await recapService.getContextRecap(
        campaignId,
        userId,
        sinceTimestamp
      );

      // Build the full LLM prompt (including next-steps preflight) so callers get a single prompt to inject (e.g. as system message)
      const { formatContextRecapPrompt } =
        await import("../../lib/prompts/recap-prompts");
      let recapPrompt = formatContextRecapPrompt(recapData);
      const { getPlanningTaskProgress } =
        await import("../campaign-context/planning-task-tools");
      const progressRes = (await (getPlanningTaskProgress.execute?.(
        {
          campaignId,
          jwt,
          includeStatuses: ["pending", "in_progress"],
        },
        {
          env,
          toolCallId: `${toolCallId}-preflight`,
        } as import("../utils").ToolExecuteOptions
      ) ?? Promise.resolve(null))) as
        | { result: { success: boolean; data?: unknown } }
        | null
        | undefined;
      const progressData =
        progressRes?.result?.success && progressRes?.result?.data
          ? (progressRes.result.data as { openTaskCount?: number })
          : null;
      const openTaskCount = progressData?.openTaskCount ?? 0;
      if (openTaskCount > 0) {
        recapPrompt += `\n\n[Server preflight: This campaign already has ${openTaskCount} open next step(s). Call getPlanningTaskProgress to retrieve them, then present those to the user. Do NOT call recordPlanningTasks.]`;
      } else {
        recapPrompt += `\n\n[Server preflight: There are no open next steps. You MUST generate 2-3 high-quality, campaign-relevant next steps (using the checklist and campaign context), then call recordPlanningTasks with them. Only after the tool succeeds may you say they have been saved and direct the user to Campaign Details > Next steps.]`;
      }

      return createToolSuccess(
        `Generated context recap for campaign "${campaign.name}"`,
        {
          campaignId,
          campaignName: campaign.name,
          recap: recapData,
          recapPrompt,
        },
        toolCallId
      );
    } catch (error) {
      console.error("[generateContextRecapTool] Error:", error);
      return createToolError(
        "Failed to generate context recap",
        error instanceof Error ? error.message : String(error),
        500,
        toolCallId
      );
    }
  },
});
