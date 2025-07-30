import type { D1Database } from "@cloudflare/workers-types";
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

export interface ActivityType {
  type:
    | "campaign_created"
    | "resource_uploaded"
    | "character_created"
    | "session_planned";
  timestamp: string;
  details: string;
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

export class AssessmentService {
  constructor(private db: D1Database) {}

  /**
   * Analyze user's current state for contextual guidance
   */
  async analyzeUserState(username: string): Promise<UserState> {
    try {
      // Get campaign count
      const campaignsResult = await this.db
        .prepare("SELECT COUNT(*) as count FROM campaigns WHERE username = ?")
        .bind(username)
        .first<{ count: number }>();

      const campaignCount = campaignsResult?.count || 0;

      // Get resource count
      const resourcesResult = await this.db
        .prepare(
          "SELECT COUNT(*) as count FROM pdf_metadata WHERE username = ?"
        )
        .bind(username)
        .first<{ count: number }>();

      const resourceCount = resourcesResult?.count || 0;

      // Get recent activity (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const activityResult = await this.db
        .prepare(
          `
          SELECT 
            'campaign_created' as type,
            created_at as timestamp,
            name as details
          FROM campaigns 
          WHERE username = ? AND created_at > ?
          UNION ALL
          SELECT 
            'resource_uploaded' as type,
            created_at as timestamp,
            file_name as details
          FROM pdf_metadata 
          WHERE username = ? AND created_at > ?
          ORDER BY timestamp DESC
          LIMIT 10
        `
        )
        .bind(
          username,
          thirtyDaysAgo.toISOString(),
          username,
          thirtyDaysAgo.toISOString()
        )
        .all<ActivityType>();

      const recentActivity = activityResult.results || [];

      // Get last login (approximated by last activity)
      const lastActivityResult = await this.db
        .prepare(
          `
          SELECT MAX(created_at) as last_activity
          FROM (
            SELECT created_at FROM campaigns WHERE username = ?
            UNION ALL
            SELECT created_at FROM pdf_metadata WHERE username = ?
          )
        `
        )
        .bind(username, username)
        .first<{ last_activity: string }>();

      const lastLoginDate =
        lastActivityResult?.last_activity || new Date().toISOString();

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
   * Get campaign health summary for existing campaigns
   */
  async getCampaignHealth(
    campaignId: string,
    _campaign: Campaign,
    resources: CampaignResource[]
  ): Promise<CampaignHealthSummary> {
    try {
      // Get campaign context data
      const contextResult = await this.db
        .prepare("SELECT * FROM campaign_context WHERE campaign_id = ?")
        .bind(campaignId)
        .all();

      const contextData = contextResult.results || [];

      // Get character data
      const charactersResult = await this.db
        .prepare("SELECT * FROM campaign_characters WHERE campaign_id = ?")
        .bind(campaignId)
        .all();

      const charactersData = charactersResult.results || [];

      // Calculate health score based on data richness
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
      console.error("Failed to get campaign health:", error);
      throw new Error("Failed to analyze campaign health");
    }
  }

  /**
   * Get user activity for personalized guidance
   */
  async getUserActivity(username: string): Promise<ActivityType[]> {
    try {
      const activityResult = await this.db
        .prepare(
          `
          SELECT 
            'campaign_created' as type,
            created_at as timestamp,
            name as details
          FROM campaigns 
          WHERE username = ?
          UNION ALL
          SELECT 
            'resource_uploaded' as type,
            created_at as timestamp,
            file_name as details
          FROM pdf_metadata 
          WHERE username = ?
          ORDER BY timestamp DESC
          LIMIT 20
        `
        )
        .bind(username, username)
        .all<ActivityType>();

      return activityResult.results || [];
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
      // Store NPCs
      for (const npc of moduleAnalysis.extractedElements.npcs) {
        await this.db
          .prepare(
            `
            INSERT INTO campaign_context 
            (id, campaign_id, context_type, title, content, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `
          )
          .bind(
            `npc_${Date.now()}_${Math.random()}`,
            campaignId,
            "npc",
            npc.name,
            JSON.stringify(npc),
            JSON.stringify({
              source: "module",
              moduleName: moduleAnalysis.moduleName,
            })
          )
          .run();
      }

      // Store locations
      for (const location of moduleAnalysis.extractedElements.locations) {
        await this.db
          .prepare(
            `
            INSERT INTO campaign_context 
            (id, campaign_id, context_type, title, content, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `
          )
          .bind(
            `location_${Date.now()}_${Math.random()}`,
            campaignId,
            "location",
            location.name,
            JSON.stringify(location),
            JSON.stringify({
              source: "module",
              moduleName: moduleAnalysis.moduleName,
            })
          )
          .run();
      }

      // Store plot hooks
      for (const plotHook of moduleAnalysis.extractedElements.plotHooks) {
        await this.db
          .prepare(
            `
            INSERT INTO campaign_context 
            (id, campaign_id, context_type, title, content, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `
          )
          .bind(
            `plot_hook_${Date.now()}_${Math.random()}`,
            campaignId,
            "plot_hook",
            plotHook.title,
            JSON.stringify(plotHook),
            JSON.stringify({
              source: "module",
              moduleName: moduleAnalysis.moduleName,
            })
          )
          .run();
      }

      // Store story beats
      for (const storyBeat of moduleAnalysis.extractedElements.storyBeats) {
        await this.db
          .prepare(
            `
            INSERT INTO campaign_context 
            (id, campaign_id, context_type, title, content, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `
          )
          .bind(
            `story_beat_${Date.now()}_${Math.random()}`,
            campaignId,
            "story_beat",
            storyBeat.title,
            JSON.stringify(storyBeat),
            JSON.stringify({
              source: "module",
              moduleName: moduleAnalysis.moduleName,
            })
          )
          .run();
      }

      // Store key items
      for (const item of moduleAnalysis.extractedElements.keyItems) {
        await this.db
          .prepare(
            `
            INSERT INTO campaign_context 
            (id, campaign_id, context_type, title, content, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `
          )
          .bind(
            `item_${Date.now()}_${Math.random()}`,
            campaignId,
            "item",
            item.name,
            JSON.stringify(item),
            JSON.stringify({
              source: "module",
              moduleName: moduleAnalysis.moduleName,
            })
          )
          .run();
      }

      // Store conflicts
      for (const conflict of moduleAnalysis.extractedElements.conflicts) {
        await this.db
          .prepare(
            `
            INSERT INTO campaign_context 
            (id, campaign_id, context_type, title, content, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `
          )
          .bind(
            `conflict_${Date.now()}_${Math.random()}`,
            campaignId,
            "conflict",
            conflict.title,
            JSON.stringify(conflict),
            JSON.stringify({
              source: "module",
              moduleName: moduleAnalysis.moduleName,
            })
          )
          .run();
      }

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
      const contextResult = await this.db
        .prepare(
          "SELECT * FROM campaign_context WHERE campaign_id = ? ORDER BY created_at DESC"
        )
        .bind(campaignId)
        .all();

      return contextResult.results || [];
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
      const charactersResult = await this.db
        .prepare(
          "SELECT * FROM campaign_characters WHERE campaign_id = ? ORDER BY created_at DESC"
        )
        .bind(campaignId)
        .all();

      return charactersResult.results || [];
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
      const resourcesResult = await this.db
        .prepare(
          "SELECT * FROM campaign_resources WHERE campaign_id = ? ORDER BY created_at DESC"
        )
        .bind(campaignId)
        .all();

      return resourcesResult.results || [];
    } catch (error) {
      console.error("Failed to get campaign resources:", error);
      throw new Error("Failed to retrieve campaign resources");
    }
  }
}
