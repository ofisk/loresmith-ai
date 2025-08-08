import { tool } from "ai";
import { z } from "zod";
import type { ToolResult } from "../../constants";
import { AssessmentService } from "../../services/assessment-service";
import { AuthService } from "../../services/auth-service";
import { createToolSuccess } from "../utils";
import { commonSchemas, createToolError } from "../utils";
import type {
  ActionSuggestion,
  ToolRecommendation,
} from "./state-analysis-tools";

/**
 * Tool: Provide welcome guidance for first-time users
 */
export const provideWelcomeGuidance = tool({
  description: "Provide welcome guidance for first-time users",
  parameters: z.object({
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ jwt }, context?: any): Promise<ToolResult> => {
    const toolCallId = context?.toolCallId || "unknown";

    try {
      // Extract username from JWT for personalization
      const username = jwt ? AuthService.parseJwtForUsername(jwt) : null;
      const userGreeting = username
        ? `Welcome, ${username}! 🎲`
        : "Welcome to LoreSmith AI! 🎲";

      const result = {
        message: `${userGreeting}

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
            description: "Find adventures, supplements, and campaign resources",
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
      };

      return createToolSuccess(
        "Welcome guidance provided successfully",
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Failed to provide welcome guidance:", error);
      return createToolError(
        "Failed to generate welcome guidance",
        { error: error instanceof Error ? error.message : String(error) },
        500,
        toolCallId
      );
    }
  },
});

/**
 * Tool: Suggest next actions based on user state
 */
export const suggestNextActions = tool({
  description: "Suggest next actions based on user state and campaign health",
  parameters: z.object({
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ jwt }, context?: any): Promise<ToolResult> => {
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

      const actions: ActionSuggestion[] = [];
      let explanation = "";

      if (userState.isFirstTime) {
        explanation =
          "Since you're new to LoreSmith AI, let's start with the basics!";
        actions.push(
          {
            title: "Upload Your First Resource",
            description:
              "Click the 'Add to library' button to start building your inspiration library",
            action: "upload_resource",
            priority: "high",
            estimatedTime: "5 minutes",
          },
          {
            title: "Create Your First Campaign",
            description: "Set up a campaign to organize your story",
            action: "create_campaign",
            priority: "high",
            estimatedTime: "10 minutes",
          }
        );
      } else if (!userState.hasCampaigns && !userState.hasResources) {
        explanation =
          "You haven't created any campaigns or uploaded resources yet. Let's get you started!";
        actions.push(
          {
            title: "Upload Resources",
            description:
              "Click the 'Add to library' button to build your inspiration library with PDFs, images, and documents",
            action: "upload_resources",
            priority: "high",
            estimatedTime: "10 minutes",
          },
          {
            title: "Create a Campaign",
            description: "Start organizing your story elements",
            action: "create_campaign",
            priority: "high",
            estimatedTime: "15 minutes",
          }
        );
      } else if (userState.hasResources && !userState.hasCampaigns) {
        explanation =
          "Great! You have resources but no campaigns yet. Let's organize them into a campaign!";
        actions.push(
          {
            title: "Create a Campaign",
            description: "Organize your resources into a campaign",
            action: "create_campaign",
            priority: "high",
            estimatedTime: "15 minutes",
          },
          {
            title: "Upload More Resources",
            description:
              "Click the 'Add to library' button to add more inspiration to your library",
            action: "upload_resources",
            priority: "medium",
            estimatedTime: "10 minutes",
          }
        );
      } else if (userState.hasCampaigns) {
        explanation =
          "You have campaigns! Let's focus on improving them and planning sessions.";
        actions.push(
          {
            title: "Plan Next Session",
            description: "Prepare for your upcoming game session",
            action: "plan_session",
            priority: "high",
            estimatedTime: "20 minutes",
          },
          {
            title: "Add More Resources",
            description:
              "Click the 'Add to library' button to enrich your campaign with new inspiration",
            action: "upload_resources",
            priority: "medium",
            estimatedTime: "10 minutes",
          }
        );
      }

      return createToolSuccess(
        "Next actions generated successfully",
        { actions, explanation },
        toolCallId
      );
    } catch (error) {
      console.error("Failed to suggest next actions:", error);
      return createToolError(
        "Failed to generate action suggestions",
        { error: error instanceof Error ? error.message : String(error) },
        500,
        toolCallId
      );
    }
  },
});

/**
 * Tool: Provide campaign-specific guidance
 */
export const provideCampaignGuidance = tool({
  description: "Provide campaign-specific guidance based on campaign health",
  parameters: z.object({
    campaignId: z.string().describe("The campaign ID to provide guidance for"),
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ campaignId, jwt }, context?: any): Promise<ToolResult> => {
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
        {} as any, // TODO: Get actual campaign data
        [] as any[] // TODO: Get actual resource data
      );

      let guidance = "";
      const priorityActions: ActionSuggestion[] = [];
      const externalTools: ToolRecommendation[] = [];

      if (campaignHealth.overallScore >= 80) {
        guidance = `Excellent! Your campaign is in great health (${campaignHealth.overallScore}/100). You're ready to focus on session planning and player engagement.`;

        priorityActions.push(
          {
            title: "Plan Next Session",
            description: "Prepare engaging encounters and story beats",
            action: "plan_session",
            priority: "high",
            estimatedTime: "20 minutes",
          },
          {
            title: "Review Player Characters",
            description: "Ensure character arcs are progressing well",
            action: "review_characters",
            priority: "medium",
            estimatedTime: "15 minutes",
          }
        );
      } else if (campaignHealth.overallScore >= 60) {
        guidance = `Your campaign is in good shape (${campaignHealth.overallScore}/100), but there's room for improvement. Let's focus on the priority areas.`;

        priorityActions.push(
          {
            title: "Address Priority Areas",
            description: "Focus on the areas that need attention",
            action: "improve_campaign",
            priority: "high",
            estimatedTime: "30 minutes",
          },
          {
            title: "Add More Resources",
            description:
              "Click the 'Add to library' button to enrich your campaign with new inspiration",
            action: "upload_resources",
            priority: "medium",
            estimatedTime: "10 minutes",
          }
        );
      } else {
        guidance = `Your campaign needs attention (${campaignHealth.overallScore}/100). Let's focus on the critical areas to improve your campaign health.`;

        priorityActions.push(
          {
            title: "Critical Campaign Improvements",
            description: "Address the most important areas first",
            action: "critical_improvements",
            priority: "high",
            estimatedTime: "45 minutes",
          },
          {
            title: "Review Campaign Foundation",
            description: "Ensure your campaign has solid fundamentals",
            action: "review_foundation",
            priority: "high",
            estimatedTime: "30 minutes",
          }
        );
      }

      // Add relevant external tools based on campaign health
      if (campaignHealth.overallScore < 70) {
        externalTools.push(
          {
            name: "DMsGuild - Adventure Hooks",
            url: "https://www.dmsguild.com/browse.php?keywords=adventure+hooks",
            description: "Find plot hooks and adventure ideas",
            category: "content",
            relevance: "high",
          },
          {
            name: "Reddit - r/DMAcademy",
            url: "https://www.reddit.com/r/DMAcademy/",
            description: "Get advice from experienced DMs",
            category: "community",
            relevance: "high",
          }
        );
      }

      return createToolSuccess(
        "Campaign guidance generated successfully",
        { guidance, priorityActions, externalTools },
        toolCallId
      );
    } catch (error) {
      console.error("Failed to provide campaign guidance:", error);
      return createToolError(
        "Failed to generate campaign guidance",
        { error: error instanceof Error ? error.message : String(error) },
        500,
        toolCallId
      );
    }
  },
});
