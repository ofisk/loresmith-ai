import { tool } from "ai";
import { z } from "zod";
import { commonSchemas, createToolError, createToolSuccess } from "../utils";
import type { ToolResult } from "../../constants";
import type {
  ActionSuggestion,
  ToolRecommendation,
} from "./state-analysis-tools";

/**
 * Tool: Provide welcome guidance for first-time users
 */
export const provideWelcomeGuidanceTool = tool({
  description: "Provide welcome guidance for first-time users",
  parameters: z.object({
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ jwt }): Promise<ToolResult> => {
    try {
      if (!jwt) {
        return createToolError("JWT is required", { error: "Missing JWT" });
      }

      const welcomeData = {
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
            "Click the 'Add Resources' button to upload PDFs, images, or documents to your inspiration library",
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
        welcomeData
      );
    } catch (error) {
      console.error("Failed to provide welcome guidance:", error);
      return createToolError("Failed to generate welcome guidance", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Tool: Suggest next actions based on user state
 */
export const suggestNextActionsTool = tool({
  description: "Suggest next actions based on user state",
  parameters: z.object({
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ jwt }): Promise<ToolResult> => {
    try {
      if (!jwt) {
        return createToolError("JWT is required", { error: "Missing JWT" });
      }

      // For now, return basic action suggestions since we don't have the AssessmentService fully implemented
      const actions: ActionSuggestion[] = [
        {
          title: "Upload Your First Resource",
          description:
            "Click the 'Add Resources' button to start building your inspiration library",
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
        },
      ];

      const explanation =
        "Since you're new to LoreSmith AI, let's start with the basics!";

      return createToolSuccess("Next actions suggested successfully", {
        actions,
        explanation,
      });
    } catch (error) {
      console.error("Failed to suggest next actions:", error);
      return createToolError("Failed to generate action suggestions", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Tool: Provide campaign-specific guidance
 */
export const provideCampaignGuidanceTool = tool({
  description: "Provide campaign-specific guidance",
  parameters: z.object({
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ jwt }): Promise<ToolResult> => {
    try {
      if (!jwt) {
        return createToolError("JWT is required", { error: "Missing JWT" });
      }

      // For now, return basic campaign guidance since we don't have the AssessmentService fully implemented
      const guidance = "Your campaign is ready for the next session!";
      const priorityActions: ActionSuggestion[] = [
        {
          title: "Plan Next Session",
          description: "Prepare engaging encounters and story beats",
          action: "plan_session",
          priority: "high",
          estimatedTime: "20 minutes",
        },
      ];
      const externalTools: ToolRecommendation[] = [
        {
          name: "DMsGuild",
          url: "https://www.dmsguild.com",
          description: "Find adventures, supplements, and campaign resources",
          category: "content",
          relevance: "high",
        },
      ];

      return createToolSuccess("Campaign guidance provided successfully", {
        guidance,
        priorityActions,
        externalTools,
      });
    } catch (error) {
      console.error("Failed to provide campaign guidance:", error);
      return createToolError("Failed to generate campaign guidance", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});
