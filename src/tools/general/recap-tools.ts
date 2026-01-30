import { tool } from "ai";
import { z } from "zod";
import type { ToolResult } from "../../app-constants";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  getEnvFromContext,
} from "../utils";
import { RecapService } from "../../services/core/recap-service";

/**
 * Tool to generate context recap data for a campaign
 * Returns recent activity, world state changes, session digests, and in-progress goals
 */
export const generateContextRecapTool = tool({
  description:
    "Generate a context recap for a campaign summarizing recent activity, world state changes, session digests, and in-progress goals. Use this when a user returns to the app after being away or when they switch campaigns.",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    jwt: commonSchemas.jwt,
    sinceTimestamp: z
      .string()
      .optional()
      .describe(
        "ISO timestamp string to get data since (defaults to 1 hour ago)"
      ),
  }),
  execute: async (
    { campaignId, jwt, sinceTimestamp },
    context?: any
  ): Promise<ToolResult> => {
    const toolCallId = context?.toolCallId || crypto.randomUUID();

    try {
      if (!jwt) {
        return createToolError(
          "Authentication required",
          "JWT token is required",
          401,
          toolCallId
        );
      }

      const env = getEnvFromContext(context);
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

      return createToolSuccess(
        `Generated context recap for campaign "${campaign.name}"`,
        {
          campaignId,
          campaignName: campaign.name,
          recap: recapData,
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
