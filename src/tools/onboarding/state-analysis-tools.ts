import { tool } from "ai";
import { z } from "zod";
import { commonSchemas, createToolError, createToolSuccess } from "../utils";
import type { ToolResult } from "../../constants";

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
export const analyzeUserStateTool = tool({
  description: "Analyze the user's current state for contextual guidance",
  parameters: z.object({
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ jwt }): Promise<ToolResult> => {
    try {
      if (!jwt) {
        return createToolError("JWT is required", { error: "Missing JWT" });
      }

      // Extract username from JWT (for future use)
      // const payload = JSON.parse(atob(jwt.split(".")[1]));
      // const username = payload.username; // Will be used when AssessmentService is implemented

      // For now, return a basic user state since we don't have the AssessmentService fully implemented
      const userState: UserState = {
        isFirstTime: true,
        hasCampaigns: false,
        hasResources: false,
        campaignCount: 0,
        resourceCount: 0,
        recentActivity: [],
        lastLoginDate: new Date().toISOString(),
        totalSessionTime: 0,
      };

      return createToolSuccess("User state analyzed successfully", {
        userState,
      });
    } catch (error) {
      console.error("Failed to analyze user state:", error);
      return createToolError("Failed to analyze user state", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Tool: Get campaign health summary for existing campaigns
 */
export const getCampaignHealthTool = tool({
  description: "Get campaign health summary for existing campaigns",
  parameters: z.object({
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ jwt }): Promise<ToolResult> => {
    try {
      if (!jwt) {
        return createToolError("JWT is required", { error: "Missing JWT" });
      }

      // For now, return a basic campaign health summary
      const campaignHealth: CampaignHealthSummary = {
        overallScore: 75,
        priorityAreas: ["Character Development", "World Building"],
        recommendations: [
          "Consider adding more character backstories",
          "Expand your campaign world with additional locations",
        ],
      };

      return createToolSuccess("Campaign health analyzed successfully", {
        campaignHealth,
      });
    } catch (error) {
      console.error("Failed to get campaign health:", error);
      return createToolError("Failed to analyze campaign health", {
        error: error instanceof Error ? error.message : String(error),
      });
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
  execute: async ({ jwt }): Promise<ToolResult> => {
    try {
      if (!jwt) {
        return createToolError("JWT is required", { error: "Missing JWT" });
      }

      // For now, return basic user activity
      const userActivity: ActivityType[] = [
        {
          type: "session_planned",
          timestamp: new Date().toISOString(),
          details: "User accessed the application",
        },
      ];

      return createToolSuccess("User activity retrieved successfully", {
        userActivity,
      });
    } catch (error) {
      console.error("Failed to get user activity:", error);
      return createToolError("Failed to retrieve user activity", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});
