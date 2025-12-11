import type { Context } from "hono";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { getDAOFactory } from "@/dao/dao-factory";

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
  get(key: "userAuth"): AuthPayload;
};

// Get personalized guidance based on user's current state
export async function handleGetWelcomeGuidance(c: ContextWithAuth) {
  try {
    const userAuth = c.get("userAuth");
    const username = userAuth.username;

    console.log(
      "[Guidance] Generating personalized guidance for user:",
      username
    );

    // Get user's current state
    const daoFactory = getDAOFactory(c.env);
    const campaigns = await daoFactory.campaignDAO.getCampaignsByUser(username);
    const files = await daoFactory.fileDAO.getFilesByUser(username);

    // Analyze recent activity (last 7 days)
    const recentCampaigns = campaigns.filter((c) => {
      const createdAt = new Date(c.created_at);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return createdAt > weekAgo;
    });

    // Generate guidance based on user state analysis
    let guidanceMessage =
      "Here are some personalized recommendations for your campaign development:\n\n";

    if (campaigns.length === 0) {
      guidanceMessage += "Start your first campaign\n";
      guidanceMessage +=
        "You don't have any campaigns yet. Create one to begin organizing your story ideas!\n\n";
      guidanceMessage += "Build your resource library\n";
      guidanceMessage +=
        "Upload PDFs, images, or documents to expand your inspiration library.\n\n";
    } else {
      guidanceMessage += `Campaign status\n`;
      guidanceMessage += `You have ${campaigns.length} campaign${campaigns.length !== 1 ? "s" : ""} and ${files.length} resources.\n\n`;

      if (recentCampaigns.length > 0) {
        guidanceMessage += `Recent activity\n`;
        guidanceMessage += `You've created ${recentCampaigns.length} campaign${recentCampaigns.length !== 1 ? "s" : ""} in the last week - great momentum!\n\n`;
      }

      guidanceMessage += `Session planning\n`;
      guidanceMessage += `Ready to plan your next session? I can help you create engaging encounters and story hooks.\n\n`;
    }

    guidanceMessage += `Recommended resources\n`;
    guidanceMessage += `Check out online marketplaces and resources for campaign inspiration and tools.\n\n`;

    guidanceMessage += `Need more help?\n`;
    guidanceMessage += `Chat with me anytime to brainstorm ideas, plan sessions, or get specific guidance!`;

    const guidance = {
      message: guidanceMessage,
      actions: [
        {
          action: "upload_resource",
          title: "Upload campaign resources",
          description:
            "Add PDFs, images, or documents to expand your campaign library",
          relevance: "high" as const,
        },
        {
          action: "create_campaign",
          title: "Create new campaign",
          description: "Start organizing your ideas into a structured campaign",
          relevance:
            campaigns.length === 0 ? ("high" as const) : ("medium" as const),
        },
        {
          action: "start_chat",
          title: "Plan your next session",
          description: "Chat with me to brainstorm ideas and plan adventures",
          relevance:
            campaigns.length > 0 ? ("high" as const) : ("medium" as const),
        },
      ],
    };

    console.log("[Guidance] Generated guidance successfully");
    return c.json(guidance);
  } catch (error) {
    console.error("Error getting welcome guidance:", error);

    // Fallback to generic guidance if analysis fails
    const fallbackGuidance = {
      message:
        "Welcome to LoreSmith campaign planner!\n\n" +
        "Choose your path to begin your campaign journey:\n\n" +
        "Build your campaign library\n" +
        "Upload adventure modules, homebrew content, maps, and reference materials. LoreSmith transforms your PDFs and documents into an intelligent, searchable knowledge base that helps you find exactly what you need when planning sessions.\n\n" +
        "Organize your story\n" +
        "Create campaigns to organize your narrative, track NPCs, manage plot hooks, and build your world. Keep all your campaign context in one place and accessible at a moment's notice.\n\n" +
        "Start brainstorming\n" +
        "Not sure where to begin? Chat with me! I can help you develop campaign ideas, create compelling NPCs, design encounters, plan sessions, and answer questions about game mechanics. Think of me as your always-available co-GM.\n\n" +
        "Ready to dive in? Pick an option below to get started:",
      actions: [
        {
          action: "upload_resource",
          title: "Upload campaign resources",
          description:
            "Add PDFs, images, or documents to expand your campaign library",
          relevance: "high" as const,
        },
        {
          action: "create_campaign",
          title: "Create your first campaign",
          description: "Start organizing your ideas into a structured campaign",
          relevance: "high" as const,
        },
        {
          action: "start_chat",
          title: "Start planning",
          description: "Chat with me to brainstorm ideas and plan adventures",
          relevance: "medium" as const,
        },
      ],
    };

    return c.json(fallbackGuidance);
  }
}

// Get next actions for onboarding
export async function handleGetNextActions(c: ContextWithAuth) {
  try {
    // This would typically analyze user state and provide personalized next steps
    const nextActions = [
      {
        action: "create_campaign",
        title: "Create your first campaign",
        description: "Start by creating a campaign to organize your materials",
        priority: "high",
      },
      {
        action: "upload_materials",
        title: "Upload campaign materials",
        description: "Add PDFs, images, or other resources to your campaign",
        priority: "medium",
      },
    ];

    return c.json({ nextActions });
  } catch (error) {
    console.error("Error getting next actions:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get state analysis for onboarding
export async function handleGetStateAnalysis(c: ContextWithAuth) {
  try {
    const { currentState: _currentState } = await c.req.json();

    // This would typically analyze the user's current state and provide insights
    const analysis = {
      currentProgress: "beginner",
      recommendations: [
        "Consider uploading some campaign materials to get started",
        "Try creating a simple campaign to test the features",
      ],
      estimatedTimeToComplete: "15 minutes",
    };

    return c.json({ analysis });
  } catch (error) {
    console.error("Error getting state analysis:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
