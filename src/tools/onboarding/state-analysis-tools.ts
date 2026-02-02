import { tool } from "ai";
import { z } from "zod";
import { getAssessmentService } from "../../lib/service-factory";
import type { Campaign, CampaignResource } from "../../types/campaign";
import type {
  UserState,
  ActivityType,
  CampaignAwareGuidance,
  CampaignReadinessSummary,
  ActionSuggestion,
  ToolRecommendation,
} from "../../types/assessment";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  type ToolExecuteOptions,
} from "../utils";

export type {
  UserState,
  ActivityType,
  CampaignAwareGuidance,
  CampaignReadinessSummary,
  ActionSuggestion,
  ToolRecommendation,
};

/**
 * Tool: Analyze user's current state for contextual guidance
 */
const analyzeUserStateParameters = z.object({
  jwt: commonSchemas.jwt,
});

export const analyzeUserStateTool = tool({
  description: "Analyze user's current state for contextual guidance",
  inputSchema: analyzeUserStateParameters,
  execute: async (
    input: z.infer<typeof analyzeUserStateParameters>,
    options: ToolExecuteOptions
  ) => {
    const { jwt } = input;
    try {
      if (!jwt) {
        return createToolError(
          "No JWT provided",
          "Authentication token is required",
          400,
          options?.toolCallId ?? "unknown"
        );
      }

      const payload = JSON.parse(atob(jwt.split(".")[1]));
      const username = payload.username;

      if (!username) {
        return createToolError(
          "No username found in JWT",
          "Unable to extract username from authentication token",
          400,
          options?.toolCallId ?? "unknown"
        );
      }

      const env = options?.env;
      if (!env) {
        return createToolError(
          "Environment not available",
          "Database connection not available",
          500,
          options?.toolCallId ?? "unknown"
        );
      }

      const assessmentService = getAssessmentService(env);
      const userState = await assessmentService.analyzeUserState(username);

      return createToolSuccess(
        `User state analyzed successfully for ${username}`,
        userState,
        options?.toolCallId ?? "unknown"
      );
    } catch (error) {
      console.error("Failed to analyze user state:", error);
      return createToolError(
        "Failed to analyze user state",
        error instanceof Error ? error.message : "Unknown error",
        500,
        options?.toolCallId ?? "unknown"
      );
    }
  },
});

/**
 * Tool: Get campaign readiness summary for existing campaigns
 * Returns user-friendly campaignState without numerical score for better UX
 */
const getCampaignReadinessParameters = z.object({
  campaignId: z.string().describe("The campaign ID to analyze"),
  jwt: commonSchemas.jwt,
});

export const getCampaignReadinessTool = tool({
  description:
    "Get campaign readiness summary with descriptive state (e.g., 'Taking Root', 'Legendary') and actionable recommendations",
  inputSchema: getCampaignReadinessParameters,
  execute: async (
    input: z.infer<typeof getCampaignReadinessParameters>,
    options: ToolExecuteOptions
  ) => {
    const { campaignId } = input;
    try {
      const env = options?.env;
      if (!env) {
        return createToolError(
          "Environment not available",
          "Database connection not available",
          500,
          options?.toolCallId ?? "unknown"
        );
      }

      const assessmentService = getAssessmentService(env);
      const campaignReadiness = await assessmentService.getCampaignReadiness(
        campaignId,
        {} as Campaign,
        [] as CampaignResource[]
      );

      const userFriendlyAssessment = {
        campaignState: campaignReadiness.campaignState,
        priorityAreas: campaignReadiness.priorityAreas,
        recommendations: campaignReadiness.recommendations,
      };

      return createToolSuccess(
        `Campaign readiness analyzed successfully for campaign ${campaignId}`,
        userFriendlyAssessment,
        options?.toolCallId ?? "unknown"
      );
    } catch (error) {
      console.error("Failed to get campaign readiness:", error);
      return createToolError(
        "Failed to analyze campaign readiness",
        error instanceof Error ? error.message : "Unknown error",
        500,
        options?.toolCallId ?? "unknown"
      );
    }
  },
});

/**
 * Tool: Get user activity for personalized guidance
 */
const getUserActivityParameters = z.object({
  jwt: commonSchemas.jwt,
});

export const getUserActivityTool = tool({
  description: "Get user activity for personalized guidance",
  inputSchema: getUserActivityParameters,
  execute: async (
    input: z.infer<typeof getUserActivityParameters>,
    options: ToolExecuteOptions
  ) => {
    const { jwt } = input;
    try {
      if (!jwt) {
        return createToolError(
          "No JWT provided",
          "Authentication token is required",
          400,
          options?.toolCallId ?? "unknown"
        );
      }

      const payload = JSON.parse(atob(jwt.split(".")[1]));
      const username = payload.username;

      if (!username) {
        return createToolError(
          "No username found in JWT",
          "Unable to extract username from authentication token",
          400,
          options?.toolCallId ?? "unknown"
        );
      }

      const env = options?.env;
      if (!env) {
        return createToolError(
          "Environment not available",
          "Database connection not available",
          500,
          options?.toolCallId ?? "unknown"
        );
      }

      const assessmentService = getAssessmentService(env);
      const userActivity = await assessmentService.getUserActivity(username);

      return createToolSuccess(
        `User activity retrieved successfully for ${username}`,
        userActivity,
        options?.toolCallId ?? "unknown"
      );
    } catch (error) {
      console.error("Failed to get user activity:", error);
      return createToolError(
        "Failed to retrieve user activity",
        error instanceof Error ? error.message : "Unknown error",
        500,
        options?.toolCallId ?? "unknown"
      );
    }
  },
});
