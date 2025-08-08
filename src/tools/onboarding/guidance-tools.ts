import { tool } from "ai";
import { z } from "zod";
import type { ToolResult } from "../../constants";
import { AssessmentService } from "../../services/assessment-service";
import { commonSchemas, createToolError, createToolSuccess } from "../utils";
import type { ActionSuggestion } from "./state-analysis-tools";

/**
 * Tool: Provide welcome guidance for first-time users
 */
export const provideWelcomeGuidanceTool = tool({
  description: "Provide welcome guidance for first-time users",
  parameters: z.object({
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ jwt: _jwt }, context?: any): Promise<ToolResult> => {
    try {
      return createToolSuccess(
        "Welcome guidance provided successfully",
        {
          message: `Welcome to LoreSmith AI! 🎲

I'm here to help you become a better Game Master by managing your inspiration library, creating rich campaign contexts, and planning engaging sessions.

**What I can help you with:**
• **Inspiration Library**: Upload and organize PDFs, maps, character art, and other resources
• **Campaign Context**: Create detailed worlds, NPCs, and story elements
• **Session Planning**: Plan engaging sessions with hooks, encounters, and story beats

Let's get you started! What would you like to do first?`,
          primaryAction: {
            title: "Upload Your First Resource",
            description:
              "Click the 'Add to library' button to upload PDFs, images, or documents to your inspiration library",
            action: "upload_resource",
            priority: "high",
            estimatedTime: "5 minutes",
          },
          secondaryActions: [
            {
              title: "Create Your First Campaign",
              description:
                "Set up a campaign and start organizing your story elements",
              action: "create_campaign",
              priority: "medium",
              estimatedTime: "10 minutes",
            },
            {
              title: "Chat with Me",
              description:
                "Tell me about your campaign ideas and I'll help you develop them",
              action: "start_chat",
              priority: "medium",
              estimatedTime: "15 minutes",
            },
          ],
          externalTools: [
            {
              name: "DMsGuild",
              url: "https://www.dmsguild.com",
              description:
                "Find adventures, supplements, and campaign resources",
              category: "content",
              relevance: "high",
            },
            {
              name: "D&D Beyond",
              url: "https://www.dndbeyond.com",
              description: "Access official D&D content and tools",
              category: "tools",
              relevance: "high",
            },
            {
              name: "Pinterest",
              url: "https://www.pinterest.com",
              description:
                "Discover maps, character art, and campaign inspiration",
              category: "inspiration",
              relevance: "high",
            },
          ],
        },
        context?.toolCallId || "unknown"
      );
    } catch (error) {
      console.error("Failed to provide welcome guidance:", error);
      return createToolError(
        "Failed to generate welcome guidance",
        error instanceof Error ? error.message : "Unknown error",
        500,
        context?.toolCallId || "unknown"
      );
    }
  },
});

/**
 * Tool: Suggest next actions based on user state
 */
export const suggestNextActionsTool = tool({
  description: "Suggest next actions based on user state",
  parameters: z.object({
    username: z.string().describe("The username to suggest actions for"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { username, jwt: _jwt },
    context?: any
  ): Promise<ToolResult> => {
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

      const assessmentService = new AssessmentService(env.DB);
      const userState = await assessmentService.analyzeUserState(username);

      const actions: ActionSuggestion[] = [];

      // Suggest actions based on user state
      if (userState.isFirstTime) {
        actions.push({
          title: "Upload Your First Resource",
          description: "Start building your inspiration library",
          action: "upload_resource",
          priority: "high",
          estimatedTime: "5 minutes",
        });
      }

      if (!userState.hasCampaigns) {
        actions.push({
          title: "Create Your First Campaign",
          description: "Set up a campaign and start organizing your story",
          action: "create_campaign",
          priority: "high",
          estimatedTime: "10 minutes",
        });
      }

      if (userState.hasResources && userState.hasCampaigns) {
        actions.push({
          title: "Plan Your Next Session",
          description: "Use your resources to plan an engaging session",
          action: "plan_session",
          priority: "medium",
          estimatedTime: "15 minutes",
        });
      }

      return createToolSuccess(
        `Next actions suggested successfully for ${username}`,
        {
          userState,
          actions,
          explanation: `Based on your current state, here are the recommended next steps to enhance your GM experience.`,
        },
        context?.toolCallId || "unknown"
      );
    } catch (error) {
      console.error("Failed to suggest next actions:", error);
      return createToolError(
        "Failed to suggest next actions",
        error instanceof Error ? error.message : "Unknown error",
        500,
        context?.toolCallId || "unknown"
      );
    }
  },
});

/**
 * Tool: Provide campaign-specific guidance
 */
export const provideCampaignGuidanceTool = tool({
  description: "Provide campaign-specific guidance based on campaign health",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID to provide guidance for"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, jwt: _jwt },
    context?: any
  ): Promise<ToolResult> => {
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

      const assessmentService = new AssessmentService(env.DB);
      const campaignHealth = await assessmentService.getCampaignHealth(
        campaignId,
        {} as any,
        []
      );

      return createToolSuccess(
        `Campaign guidance provided successfully for campaign ${campaignId}`,
        {
          campaignHealth,
          primaryAction: {
            title: "Improve Campaign Health",
            description:
              "Focus on the priority areas identified in your campaign health assessment",
            action: "improve_campaign",
            priority: "high",
            estimatedTime: "20 minutes",
          },
          secondaryActions: [
            {
              title: "Add More Resources",
              description:
                "Upload additional resources to enrich your campaign",
              action: "upload_resource",
              priority: "medium",
              estimatedTime: "10 minutes",
            },
            {
              title: "Plan Next Session",
              description: "Use your campaign context to plan the next session",
              action: "plan_session",
              priority: "medium",
              estimatedTime: "15 minutes",
            },
          ],
          explanation: `Your campaign health assessment shows areas for improvement. Focus on the priority areas to enhance your campaign experience.`,
        },
        context?.toolCallId || "unknown"
      );
    } catch (error) {
      console.error("Failed to provide campaign guidance:", error);
      return createToolError(
        "Failed to provide campaign guidance",
        error instanceof Error ? error.message : "Unknown error",
        500,
        context?.toolCallId || "unknown"
      );
    }
  },
});
