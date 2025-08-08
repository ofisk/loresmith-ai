import { tool } from "ai";
import { z } from "zod";
import { AssessmentService } from "../../services/assessment-service";
import { AuthService } from "../../services/auth-service";
import type { Campaign, CampaignResource } from "../../types/campaign";
import { commonSchemas, createToolError, createToolSuccess } from "../utils";

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
  campaignHealth?: CampaignHealthSummary;
  primaryAction: ActionSuggestion;
  secondaryActions: ActionSuggestion[];
  explanation: string;
  externalTools?: ToolRecommendation[];
}

export interface CampaignHealthSummary {
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
export const analyzeUserState = tool({
  description:
    "Analyze the user's current state to provide contextual guidance",
  parameters: z.object({
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ jwt }, context?: any): Promise<any> => {
    const toolCallId = context?.toolCallId || "unknown";

    try {
      const env = context?.env;
      if (!env) {
        return createToolError(
          "Environment not available",
          { error: "Environment not available" },
          500,
          toolCallId
        );
      }

      // Extract username from JWT
      const username = jwt ? AuthService.parseJwtForUsername(jwt) : null;
      if (!username) {
        return createToolError(
          "Invalid JWT token",
          { error: "Could not extract username from JWT" },
          401,
          toolCallId
        );
      }

      const assessmentService = new AssessmentService(env.DB);
      const userState = await assessmentService.analyzeUserState(username);

      return createToolSuccess(
        "User state analyzed successfully",
        { userState },
        toolCallId
      );
    } catch (error) {
      console.error("Failed to analyze user state:", error);
      return createToolError(
        "Failed to analyze user state",
        { error: error instanceof Error ? error.message : String(error) },
        500,
        toolCallId
      );
    }
  },
});

/**
 * Tool: Get campaign health summary for existing campaigns
 */
export const getCampaignHealth = tool({
  description: "Get campaign health summary for existing campaigns",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID to analyze"),
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ campaignId, jwt }, context?: any): Promise<any> => {
    const toolCallId = context?.toolCallId || "unknown";

    try {
      const env = context?.env;
      if (!env) {
        return createToolError(
          "Environment not available",
          { error: "Environment not available" },
          500,
          toolCallId
        );
      }

      // Extract username from JWT
      const username = jwt ? AuthService.parseJwtForUsername(jwt) : null;
      if (!username) {
        return createToolError(
          "Invalid JWT token",
          { error: "Could not extract username from JWT" },
          401,
          toolCallId
        );
      }

      const assessmentService = new AssessmentService(env.DB);
      const campaignHealth = await assessmentService.getCampaignHealth(
        campaignId,
        {} as Campaign, // TODO: Get actual campaign data
        [] as CampaignResource[] // TODO: Get actual resource data
      );

      return createToolSuccess(
        "Campaign health analyzed successfully",
        { campaignHealth },
        toolCallId
      );
    } catch (error) {
      console.error("Failed to get campaign health:", error);
      return createToolError(
        "Failed to analyze campaign health",
        { error: error instanceof Error ? error.message : String(error) },
        500,
        toolCallId
      );
    }
  },
});

/**
 * Tool: Get user activity for personalized guidance
 */
export const getUserActivity = tool({
  description: "Get user activity for personalized guidance",
  parameters: z.object({
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ jwt }, context?: any): Promise<any> => {
    const toolCallId = context?.toolCallId || "unknown";

    try {
      const env = context?.env;
      if (!env) {
        return createToolError(
          "Environment not available",
          { error: "Environment not available" },
          500,
          toolCallId
        );
      }

      // Extract username from JWT
      const username = jwt ? AuthService.parseJwtForUsername(jwt) : null;
      if (!username) {
        return createToolError(
          "Invalid JWT token",
          { error: "Could not extract username from JWT" },
          401,
          toolCallId
        );
      }

      const assessmentService = new AssessmentService(env.DB);
      const activity = await assessmentService.getUserActivity(username);

      return createToolSuccess(
        "User activity retrieved successfully",
        { activity },
        toolCallId
      );
    } catch (error) {
      console.error("Failed to get user activity:", error);
      return createToolError(
        "Failed to retrieve user activity",
        { error: error instanceof Error ? error.message : String(error) },
        500,
        toolCallId
      );
    }
  },
});
