import type { Context } from "hono";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
  get(key: "userAuth"): AuthPayload;
};

// Get welcome guidance for onboarding
export async function handleGetWelcomeGuidance(c: ContextWithAuth) {
  try {
    // This would typically fetch from a database or external service
    const guidance = {
      welcome:
        "Welcome to LoreSmith AI! Let's get you started with your first campaign.",
      steps: [
        "Create your first campaign",
        "Upload some campaign materials",
        "Start chatting with your AI assistant",
      ],
    };

    return c.json({ guidance });
  } catch (error) {
    console.error("Error getting welcome guidance:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get next actions for onboarding
export async function handleGetNextActions(c: ContextWithAuth) {
  try {
    // This would typically analyze user state and provide personalized next steps
    const nextActions = [
      {
        action: "create_campaign",
        title: "Create Your First Campaign",
        description: "Start by creating a campaign to organize your materials",
        priority: "high",
      },
      {
        action: "upload_materials",
        title: "Upload Campaign Materials",
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
