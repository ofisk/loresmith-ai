import { type ActivityType, AssessmentDAO } from "../dao/assessment-dao";
import type { Env } from "../middleware/auth";
import type { ModuleAnalysis } from "../tools/campaign-context/assessment-core";
import type { Campaign, CampaignResource } from "../types/campaign";

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

export type { ActivityType };

export interface CampaignReadinessSummary {
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

export class AssessmentService {
  private assessmentDAO: AssessmentDAO;

  constructor(env: Env) {
    this.assessmentDAO = new AssessmentDAO(env.DB);
  }

  /**
   * Analyze user's current state for contextual guidance
   */
  async analyzeUserState(username: string): Promise<UserState> {
    try {
      // Get campaign and resource counts
      const campaignCount = await this.assessmentDAO.getCampaignCount(username);
      const resourceCount = await this.assessmentDAO.getResourceCount(username);

      // Get recent activity
      const recentActivity =
        await this.assessmentDAO.getRecentActivity(username);

      // Get last login (approximated by last activity)
      const lastLoginDate =
        (await this.assessmentDAO.getLastActivity(username)) ||
        new Date().toISOString();

      // Calculate total session time (approximated by activity count)
      const totalSessionTime = recentActivity.length * 30; // Rough estimate: 30 minutes per activity

      return {
        isFirstTime: campaignCount === 0 && resourceCount === 0,
        hasCampaigns: campaignCount > 0,
        hasResources: resourceCount > 0,
        campaignCount,
        resourceCount,
        recentActivity,
        lastLoginDate,
        totalSessionTime,
      };
    } catch (error) {
      console.error("Failed to analyze user state:", error);
      throw new Error("Failed to analyze user state");
    }
  }

  /**
   * Get campaign readiness summary for existing campaigns
   */
  async getCampaignReadiness(
    campaignId: string,
    _campaign: Campaign,
    resources: CampaignResource[]
  ): Promise<CampaignReadinessSummary> {
    try {
      // Get campaign data
      const contextData =
        await this.assessmentDAO.getCampaignContext(campaignId);
      const charactersData =
        await this.assessmentDAO.getCampaignCharacters(campaignId);

      // Calculate readiness score based on data richness
      const contextCount = contextData.length;
      const characterCount = charactersData.length;
      const resourceCount = resources.length;

      // Simple scoring algorithm (can be enhanced with AI analysis)
      let overallScore = 0;
      const priorityAreas: string[] = [];
      const recommendations: string[] = [];

      // Score based on context richness
      if (contextCount === 0) {
        overallScore += 10;
        priorityAreas.push("Campaign Context");
        recommendations.push("Add world descriptions and campaign notes");
      } else if (contextCount < 3) {
        overallScore += 30;
        priorityAreas.push("Campaign Context");
        recommendations.push("Expand your campaign context with more details");
      } else {
        overallScore += 50;
      }

      // Score based on character development
      if (characterCount === 0) {
        overallScore += 10;
        priorityAreas.push("Character Development");
        recommendations.push("Create player characters and NPCs");
      } else if (characterCount < 3) {
        overallScore += 30;
        priorityAreas.push("Character Development");
        recommendations.push(
          "Develop more character backstories and relationships"
        );
      } else {
        overallScore += 50;
      }

      // Score based on resources
      if (resourceCount === 0) {
        overallScore += 10;
        priorityAreas.push("Resources");
        recommendations.push(
          "Upload campaign resources and inspiration materials"
        );
      } else if (resourceCount < 5) {
        overallScore += 30;
        priorityAreas.push("Resources");
        recommendations.push("Add more resources to enrich your campaign");
      } else {
        overallScore += 40;
      }

      // Normalize score to 0-100
      overallScore = Math.min(100, Math.max(0, overallScore));

      return {
        overallScore,
        priorityAreas,
        recommendations,
      };
    } catch (error) {
      console.error("Failed to get campaign readiness:", error);
      throw new Error("Failed to analyze campaign readiness");
    }
  }

  /**
   * Get user activity for personalized guidance
   */
  async getUserActivity(username: string): Promise<ActivityType[]> {
    try {
      return await this.assessmentDAO.getUserActivity(username);
    } catch (error) {
      console.error("Failed to get user activity:", error);
      throw new Error("Failed to retrieve user activity");
    }
  }

  /**
   * Store extracted module information in campaign context
   */
  async storeModuleAnalysis(
    campaignId: string,
    moduleAnalysis: ModuleAnalysis
  ): Promise<boolean> {
    try {
      const { extractedElements, moduleName } = moduleAnalysis;

      // Store all extracted elements using the DAO
      await this.assessmentDAO.storeNPCs(
        campaignId,
        extractedElements.npcs,
        moduleName
      );
      await this.assessmentDAO.storeLocations(
        campaignId,
        extractedElements.locations,
        moduleName
      );
      await this.assessmentDAO.storePlotHooks(
        campaignId,
        extractedElements.plotHooks,
        moduleName
      );
      await this.assessmentDAO.storeStoryBeats(
        campaignId,
        extractedElements.storyBeats,
        moduleName
      );
      await this.assessmentDAO.storeKeyItems(
        campaignId,
        extractedElements.keyItems,
        moduleName
      );
      await this.assessmentDAO.storeConflicts(
        campaignId,
        extractedElements.conflicts,
        moduleName
      );

      return true;
    } catch (error) {
      console.error("Failed to store module analysis:", error);
      return false;
    }
  }

  /**
   * Get campaign context for assessment
   */
  async getCampaignContext(campaignId: string): Promise<any[]> {
    try {
      return await this.assessmentDAO.getCampaignContextOrdered(campaignId);
    } catch (error) {
      console.error("Failed to get campaign context:", error);
      throw new Error("Failed to retrieve campaign context");
    }
  }

  /**
   * Get campaign characters for assessment
   */
  async getCampaignCharacters(campaignId: string): Promise<any[]> {
    try {
      return await this.assessmentDAO.getCampaignCharactersOrdered(campaignId);
    } catch (error) {
      console.error("Failed to get campaign characters:", error);
      throw new Error("Failed to retrieve campaign characters");
    }
  }

  /**
   * Get campaign resources for assessment
   */
  async getCampaignResources(campaignId: string): Promise<any[]> {
    try {
      return await this.assessmentDAO.getCampaignResourcesOrdered(campaignId);
    } catch (error) {
      console.error("Failed to get campaign resources:", error);
      throw new Error("Failed to retrieve campaign resources");
    }
  }
}
