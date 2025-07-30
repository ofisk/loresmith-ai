import type { Campaign, CampaignResource } from "../../types/campaign";
import { AssessmentService } from "../../lib/assessmentService";

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
export async function analyzeUserStateTool(
  username: string,
  db: any
): Promise<UserState> {
  try {
    const assessmentService = new AssessmentService(db);
    return await assessmentService.analyzeUserState(username);
  } catch (error) {
    console.error("Failed to analyze user state:", error);
    throw new Error("Failed to analyze user state");
  }
}

/**
 * Tool: Get campaign health summary for existing campaigns
 */
export async function getCampaignHealthTool(
  campaignId: string,
  campaign: Campaign,
  resources: CampaignResource[],
  db: any
): Promise<CampaignHealthSummary> {
  try {
    const assessmentService = new AssessmentService(db);
    return await assessmentService.getCampaignHealth(
      campaignId,
      campaign,
      resources
    );
  } catch (error) {
    console.error("Failed to get campaign health:", error);
    throw new Error("Failed to analyze campaign health");
  }
}

/**
 * Tool: Get user activity for personalized guidance
 */
export async function getUserActivityTool(
  username: string,
  db: any
): Promise<ActivityType[]> {
  try {
    const assessmentService = new AssessmentService(db);
    return await assessmentService.getUserActivity(username);
  } catch (error) {
    console.error("Failed to get user activity:", error);
    throw new Error("Failed to retrieve user activity");
  }
}
