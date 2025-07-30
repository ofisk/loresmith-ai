import { AssessmentService } from "../../lib/assessmentService";
import type {
  ActionSuggestion,
  CampaignHealthSummary,
  ToolRecommendation,
} from "./state-analysis-tools";

/**
 * Tool: Provide welcome guidance for first-time users
 */
export async function provideWelcomeGuidanceTool(): Promise<{
  message: string;
  primaryAction: ActionSuggestion;
  secondaryActions: ActionSuggestion[];
  externalTools: ToolRecommendation[];
}> {
  try {
    return {
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
          description: "Discover maps, character art, and campaign inspiration",
          category: "inspiration",
          relevance: "high",
        },
      ],
    };
  } catch (error) {
    console.error("Failed to provide welcome guidance:", error);
    throw new Error("Failed to generate welcome guidance");
  }
}

/**
 * Tool: Suggest next actions based on user state
 */
export async function suggestNextActionsTool(
  username: string,
  db: any,
  campaignHealth?: CampaignHealthSummary
): Promise<{
  actions: ActionSuggestion[];
  explanation: string;
}> {
  try {
    const assessmentService = new AssessmentService(db);
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
        }
      );
    } else if (!userState.hasCampaigns && !userState.hasResources) {
      explanation =
        "You haven't created any campaigns or uploaded resources yet. Let's get you started!";
      actions.push(
        {
          title: "Upload Resources",
          description:
            "Click the 'Add Resources' button to build your inspiration library with PDFs, images, and documents",
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
            "Click the 'Add Resources' button to add more inspiration to your library",
          action: "upload_resources",
          priority: "medium",
          estimatedTime: "10 minutes",
        }
      );
    } else if (userState.hasCampaigns && campaignHealth) {
      explanation = `Your campaign has a health score of ${campaignHealth.overallScore}/100. Let's focus on the areas that need attention!`;

      if (campaignHealth.overallScore < 60) {
        actions.push({
          title: "Improve Campaign Health",
          description: "Focus on the priority areas identified",
          action: "improve_campaign",
          priority: "high",
          estimatedTime: "30 minutes",
        });
      } else {
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
              "Click the 'Add Resources' button to enrich your campaign with new inspiration",
            action: "upload_resources",
            priority: "medium",
            estimatedTime: "10 minutes",
          }
        );
      }
    }

    return { actions, explanation };
  } catch (error) {
    console.error("Failed to suggest next actions:", error);
    throw new Error("Failed to generate action suggestions");
  }
}

/**
 * Tool: Provide campaign-specific guidance
 */
export async function provideCampaignGuidanceTool(
  _campaignId: string,
  campaignHealth: CampaignHealthSummary
): Promise<{
  guidance: string;
  priorityActions: ActionSuggestion[];
  externalTools: ToolRecommendation[];
}> {
  try {
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
            "Click the 'Add Resources' button to enrich your campaign with new inspiration",
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

    return { guidance, priorityActions, externalTools };
  } catch (error) {
    console.error("Failed to provide campaign guidance:", error);
    throw new Error("Failed to generate campaign guidance");
  }
}
