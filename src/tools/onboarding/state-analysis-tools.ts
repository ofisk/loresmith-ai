import { tool } from "ai";
import { z } from "zod";
import { getAssessmentService } from "../../lib/service-factory";
import type { Campaign, CampaignResource } from "../../types/campaign";
import { commonSchemas } from "../utils";
import { createToolError, createToolSuccess } from "../utils";

/**
 * User state analysis for contextual guidance
 */
export interface UserState {
  isFirstTime: boolean;
  hasCampaigns: boolean;
  hasResources: boolean;
  campaignCount: number;
  resourceCount: number;
  recentActivity: ActivityType[];
  lastLoginDate: string;
  totalSessionTime: number;
}

export interface ActivityType {
  type:
    | "campaign_created"
    | "resource_uploaded"
    | "character_created"
    | "session_planned";
  timestamp: string;
  details: string;
}

/**
 * Campaign-aware guidance response
 */
export interface CampaignAwareGuidance {
  userState: UserState;
  campaignReadiness?: CampaignReadinessSummary;
  primaryAction: ActionSuggestion;
  secondaryActions: ActionSuggestion[];
  explanation: string;
  externalTools?: ToolRecommendation[];
}

export interface CampaignReadinessSummary {
  overallScore: number;
  priorityAreas: string[];
  recommendations: string[];
}

export interface ActionSuggestion {
  title: string;
  description: string;
  action: string;
  priority: "high" | "medium" | "low";
  estimatedTime: string;
}

export interface ToolRecommendation {
  name: string;
  url: string;
  description: string;
  category: "inspiration" | "tools" | "community" | "content";
  relevance: "high" | "medium" | "low";
}

/**
 * Tool: Analyze user's current state for contextual guidance
 */
export const analyzeUserStateTool = tool({
  description: "Analyze user's current state for contextual guidance",
  parameters: z.object({
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ jwt }, context?: any) => {
    try {
      // Extract username from JWT
      if (!jwt) {
        return createToolError(
          "No JWT provided",
          "Authentication token is required",
          400,
          context?.toolCallId || "unknown"
        );
      }

      const payload = JSON.parse(atob(jwt.split(".")[1]));
      const username = payload.username;

      if (!username) {
        return createToolError(
          "No username found in JWT",
          "Unable to extract username from authentication token",
          400,
          context?.toolCallId || "unknown"
        );
      }

      const env = context?.env;
      if (!env) {
        return createToolError(
          "Environment not available",
          "Database connection not available",
          500,
          context?.toolCallId || "unknown"
        );
      }

      const assessmentService = getAssessmentService(env);
      const userState = await assessmentService.analyzeUserState(username);

      return createToolSuccess(
        `User state analyzed successfully for ${username}`,
        userState,
        context?.toolCallId || "unknown"
      );
    } catch (error) {
      console.error("Failed to analyze user state:", error);
      return createToolError(
        "Failed to analyze user state",
        error instanceof Error ? error.message : "Unknown error",
        500,
        context?.toolCallId || "unknown"
      );
    }
  },
});

/**
 * Tool: Get campaign readiness summary for existing campaigns
 */
export const getCampaignReadinessTool = tool({
  description: "Get campaign readiness summary for existing campaigns",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID to analyze"),
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ campaignId, jwt: _jwt }, context?: any) => {
    try {
      const env = context?.env;
      if (!env) {
        return createToolError(
          "Environment not available",
          "Database connection not available",
          500,
          context?.toolCallId || "unknown"
        );
      }

      const assessmentService = getAssessmentService(env);
      // Note: This would need campaign and resources data, simplified for now
      const campaignReadiness = await assessmentService.getCampaignReadiness(
        campaignId,
        {} as Campaign,
        [] as CampaignResource[]
      );

      return createToolSuccess(
        `Campaign readiness analyzed successfully for campaign ${campaignId}`,
        campaignReadiness,
        context?.toolCallId || "unknown"
      );
    } catch (error) {
      console.error("Failed to get campaign readiness:", error);
      return createToolError(
        "Failed to analyze campaign readiness",
        error instanceof Error ? error.message : "Unknown error",
        500,
        context?.toolCallId || "unknown"
      );
    }
  },
});

/**
 * Tool: Get user activity for personalized guidance
 */
export const getUserActivityTool = tool({
  description: "Get user activity for personalized guidance",
  parameters: z.object({
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ jwt }, context?: any) => {
    try {
      // Extract username from JWT
      if (!jwt) {
        return createToolError(
          "No JWT provided",
          "Authentication token is required",
          400,
          context?.toolCallId || "unknown"
        );
      }

      const payload = JSON.parse(atob(jwt.split(".")[1]));
      const username = payload.username;

      if (!username) {
        return createToolError(
          "No username found in JWT",
          "Unable to extract username from authentication token",
          400,
          context?.toolCallId || "unknown"
        );
      }

      const env = context?.env;
      if (!env) {
        return createToolError(
          "Environment not available",
          "Database connection not available",
          500,
          context?.toolCallId || "unknown"
        );
      }

      const assessmentService = getAssessmentService(env);
      const userActivity = await assessmentService.getUserActivity(username);

      return createToolSuccess(
        `User activity retrieved successfully for ${username}`,
        userActivity,
        context?.toolCallId || "unknown"
      );
    } catch (error) {
      console.error("Failed to get user activity:", error);
      return createToolError(
        "Failed to retrieve user activity",
        error instanceof Error ? error.message : "Unknown error",
        500,
        context?.toolCallId || "unknown"
      );
    }
  },
});
