import type { Context } from "hono";
import { getAssessmentService } from "../lib/service-factory";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

// Get user state for assessment
export async function handleGetUserState(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const assessmentService = getAssessmentService(c.env);
    const userState = await assessmentService.analyzeUserState(
      userAuth.username
    );

    return c.json({ userState });
  } catch (error) {
    console.error("Error getting user state:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get assessment recommendations
export async function handleGetAssessmentRecommendations(c: ContextWithAuth) {
  try {
    const { currentModule, userState } = await c.req.json();

    if (!currentModule) {
      return c.json({ error: "Current module is required" }, 400);
    }

    const assessmentService = getAssessmentService(c.env);
    const recommendations = await assessmentService.getCampaignReadiness(
      currentModule,
      userState,
      []
    );

    return c.json({ recommendations });
  } catch (error) {
    console.error("Error getting assessment recommendations:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get user activity for assessment
export async function handleGetUserActivity(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const assessmentService = getAssessmentService(c.env);
    const activity = await assessmentService.getUserActivity(userAuth.username);

    return c.json({ activity });
  } catch (error) {
    console.error("Error getting user activity:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Integrate module with assessment
export async function handleModuleIntegration(c: ContextWithAuth) {
  try {
    const { moduleName, integrationData } = await c.req.json();

    if (!moduleName) {
      return c.json({ error: "Module name is required" }, 400);
    }

    const assessmentService = getAssessmentService(c.env);
    const result = await assessmentService.storeModuleAnalysis(
      moduleName,
      integrationData
    );

    return c.json({ success: true, result });
  } catch (error) {
    console.error("Error integrating module:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
