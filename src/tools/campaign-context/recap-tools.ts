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
 * Single tool for campaign context recap. Uses RecapService (session digests,
 * world state changes, in-progress goals), builds the recap prompt with
 * next-steps preflight, and returns recapPrompt for the agent. Used both when
 * the user returns to the app (automatic recap) and when the agent needs
 * context recap (e.g. "give me a recap").
 */
export const generateContextRecapTool = tool({
  description:
    "Generate a context recap for a campaign summarizing recent activity, world state changes, session digests, and in-progress goals. Use this when a user returns to the app after being away, when they switch campaigns, or when they ask for a recap.",
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

      const recapService = new RecapService(
        env as import("@/middleware/auth").Env
      );
      const recapData = await recapService.getContextRecap(
        campaignId,
        userId,
        sinceTimestamp
      );

      const { formatContextRecapPrompt } =
        await import("../../lib/prompts/recap-prompts");
      let recapPrompt = formatContextRecapPrompt(recapData);
      const { getPlanningTaskProgress } = await import("./planning-task-tools");
      const progressRes = (await (getPlanningTaskProgress.execute?.(
        {
          campaignId,
          jwt,
          includeStatuses: ["pending", "in_progress"],
        },
        {
          env,
          toolCallId: `${toolCallId}-preflight`,
        } as ToolExecuteOptions
      ) ?? Promise.resolve(null))) as
        | { result: { success: boolean; data?: unknown } }
        | null
        | undefined;
      const progressData =
        progressRes?.result?.success && progressRes?.result?.data
          ? (progressRes.result.data as {
              openTaskCount?: number;
              counts?: { completed?: number };
            })
          : null;
      const openTaskCount = progressData?.openTaskCount ?? 0;
      const completedCount = progressData?.counts?.completed ?? 0;
      if (openTaskCount > 0) {
        recapPrompt += `\n\n[Server preflight: This campaign already has ${openTaskCount} open next step(s). Call getPlanningTaskProgress to retrieve them, then present those to the user. Do NOT call recordPlanningTasks.]`;
      } else if (completedCount > 0) {
        recapPrompt += `\n\n[Server preflight: All next steps for this campaign are complete (${completedCount} completed). Your first response MUST be to ask: "Would you like me to construct a readout for your next session's plan? I'll stitch together your completion notes into a ready-to-run plan you can follow at the table—or is there something else you'd like to add first?" Do NOT suggest new next steps, World Expansion, Session Prep, or Player Engagement until the user answers. Do NOT call recordPlanningTasks.]`;
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
