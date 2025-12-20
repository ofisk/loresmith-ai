import type { D1Database } from "@cloudflare/workers-types";

export interface ActivityType {
  type:
    | "campaign_created"
    | "resource_uploaded"
    | "character_created"
    | "session_planned";
  timestamp: string;
  details: string;
}

export class AssessmentDAO {
  constructor(private db: D1Database) {}

  /**
   * Get campaign count for a user
   */
  async getCampaignCount(username: string): Promise<number> {
    const result = await this.db
      .prepare("SELECT COUNT(*) as count FROM campaigns WHERE username = ?")
      .bind(username)
      .first<{ count: number }>();

    return result?.count || 0;
  }

  /**
   * Get resource count for a user
   */
  async getResourceCount(username: string): Promise<number> {
    const result = await this.db
      .prepare("SELECT COUNT(*) as count FROM file_metadata WHERE username = ?")
      .bind(username)
      .first<{ count: number }>();

    return result?.count || 0;
  }

  /**
   * Get recent activity for a user (last 30 days)
   */
  async getRecentActivity(username: string): Promise<ActivityType[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.db
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
        FROM file_metadata 
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

    return result.results || [];
  }

  /**
   * Get last activity timestamp for a user
   */
  async getLastActivity(username: string): Promise<string | null> {
    const result = await this.db
      .prepare(
        `
        SELECT MAX(created_at) as last_activity
        FROM (
          SELECT created_at FROM campaigns WHERE username = ?
          UNION ALL
          SELECT created_at FROM file_metadata WHERE username = ?
        )
      `
      )
      .bind(username, username)
      .first<{ last_activity: string }>();

    return result?.last_activity || null;
  }

  /**
   * Get campaign context data for readiness assessment
   * Now queries entities with conversational context types instead of campaign_context table
   */
  async getCampaignContext(
    campaignId: string,
    entityDAO?: any
  ): Promise<any[]> {
    if (!entityDAO) {
      throw new Error("entityDAO is required for getCampaignContext");
    }

    // Query entities with conversational context types
    const conversationalContextTypes = [
      "plot_decision",
      "character_decision",
      "world_building",
      "theme_preference",
      "house_rule",
      "session_note",
      "player_preference",
    ];

    // Query entities for each type and combine
    const allContext: any[] = [];
    for (const entityType of conversationalContextTypes) {
      const entities = await entityDAO.listEntitiesByCampaign(campaignId, {
        entityType,
      });
      allContext.push(...entities);
    }

    return allContext;
  }

  /**
   * Get campaign characters for readiness assessment
   * Now only queries entities table (simplified to use single source of truth)
   */
  async getCampaignCharacters(
    campaignId: string,
    entityDAO?: any
  ): Promise<any[]> {
    if (!entityDAO) {
      throw new Error("entityDAO is required for getCampaignCharacters");
    }

    // Query entities for character-related types
    const characterEntityTypes = [
      "characters",
      "npcs",
      "player_characters",
      "character_sheets",
    ];

    // Query entities for each type and combine
    const allCharacters: any[] = [];
    for (const entityType of characterEntityTypes) {
      const entities = await entityDAO.listEntitiesByCampaign(campaignId, {
        entityType,
      });
      allCharacters.push(...entities);
    }

    return allCharacters;
  }

  /**
   * Get all user activity (up to 20 recent items)
   */
  async getUserActivity(username: string): Promise<ActivityType[]> {
    const result = await this.db
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
        FROM file_metadata 
        WHERE username = ?
        ORDER BY timestamp DESC
        LIMIT 20
      `
      )
      .bind(username, username)
      .all<ActivityType>();

    return result.results || [];
  }

  /**
   * Store NPCs from module analysis
   */
  async storeNPCs(
    campaignId: string,
    npcs: any[],
    moduleName: string,
    entityDAO?: any
  ): Promise<void> {
    if (!entityDAO) {
      throw new Error("entityDAO is required for storeNPCs");
    }

    for (const npc of npcs) {
      const entityId = crypto.randomUUID();
      await entityDAO.createEntity({
        id: entityId,
        campaignId,
        entityType: "npcs",
        name: npc.name || "Unnamed NPC",
        content: npc,
        metadata: {
          source: "module",
          moduleName,
        },
        sourceType: "module",
        sourceId: moduleName,
      });
    }
  }

  /**
   * Store locations from module analysis
   */
  async storeLocations(
    campaignId: string,
    locations: any[],
    moduleName: string,
    entityDAO?: any
  ): Promise<void> {
    if (!entityDAO) {
      throw new Error("entityDAO is required for storeLocations");
    }

    for (const location of locations) {
      const entityId = crypto.randomUUID();
      await entityDAO.createEntity({
        id: entityId,
        campaignId,
        entityType: "locations",
        name: location.name || "Unnamed Location",
        content: location,
        metadata: {
          source: "module",
          moduleName,
        },
        sourceType: "module",
        sourceId: moduleName,
      });
    }
  }

  /**
   * Store plot hooks from module analysis
   */
  async storePlotHooks(
    campaignId: string,
    plotHooks: any[],
    moduleName: string,
    entityDAO?: any
  ): Promise<void> {
    if (!entityDAO) {
      throw new Error("entityDAO is required for storePlotHooks");
    }

    for (const plotHook of plotHooks) {
      const entityId = crypto.randomUUID();
      await entityDAO.createEntity({
        id: entityId,
        campaignId,
        entityType: "hooks",
        name: plotHook.title || "Unnamed Plot Hook",
        content: plotHook,
        metadata: {
          source: "module",
          moduleName,
        },
        sourceType: "module",
        sourceId: moduleName,
      });
    }
  }

  /**
   * Store story beats from module analysis
   */
  async storeStoryBeats(
    campaignId: string,
    storyBeats: any[],
    moduleName: string,
    entityDAO?: any
  ): Promise<void> {
    if (!entityDAO) {
      throw new Error("entityDAO is required for storeStoryBeats");
    }

    for (const storyBeat of storyBeats) {
      const entityId = crypto.randomUUID();
      await entityDAO.createEntity({
        id: entityId,
        campaignId,
        entityType: "plot_lines",
        name: storyBeat.title || "Unnamed Story Beat",
        content: storyBeat,
        metadata: {
          source: "module",
          moduleName,
        },
        sourceType: "module",
        sourceId: moduleName,
      });
    }
  }

  /**
   * Store key items from module analysis
   */
  async storeKeyItems(
    campaignId: string,
    keyItems: any[],
    moduleName: string,
    entityDAO?: any
  ): Promise<void> {
    if (!entityDAO) {
      throw new Error("entityDAO is required for storeKeyItems");
    }

    for (const item of keyItems) {
      const entityId = crypto.randomUUID();
      await entityDAO.createEntity({
        id: entityId,
        campaignId,
        entityType: "items",
        name: item.name || "Unnamed Item",
        content: item,
        metadata: {
          source: "module",
          moduleName,
        },
        sourceType: "module",
        sourceId: moduleName,
      });
    }
  }

  /**
   * Store conflicts from module analysis
   */
  async storeConflicts(
    campaignId: string,
    conflicts: any[],
    moduleName: string,
    entityDAO?: any
  ): Promise<void> {
    if (!entityDAO) {
      throw new Error("entityDAO is required for storeConflicts");
    }

    for (const conflict of conflicts) {
      const entityId = crypto.randomUUID();
      await entityDAO.createEntity({
        id: entityId,
        campaignId,
        entityType: "factions",
        name: conflict.title || "Unnamed Conflict",
        content: conflict,
        metadata: {
          source: "module",
          moduleName,
        },
        sourceType: "module",
        sourceId: moduleName,
      });
    }
  }

  /**
   * Get campaign context ordered by creation date
   * Now queries entities instead of campaign_context table
   */
  async getCampaignContextOrdered(
    campaignId: string,
    entityDAO?: any
  ): Promise<any[]> {
    if (!entityDAO) {
      throw new Error("entityDAO is required for getCampaignContextOrdered");
    }

    // Use the same logic as getCampaignContext (already ordered by updated_at DESC)
    return await this.getCampaignContext(campaignId, entityDAO);
  }

  /**
   * Get campaign characters ordered by creation date
   * Now queries entities only
   */
  async getCampaignCharactersOrdered(
    campaignId: string,
    entityDAO?: any
  ): Promise<any[]> {
    if (!entityDAO) {
      throw new Error("entityDAO is required for getCampaignCharactersOrdered");
    }

    // Use the same logic as getCampaignCharacters (already ordered by updated_at DESC)
    return await this.getCampaignCharacters(campaignId, entityDAO);
  }

  /**
   * Get campaign resources ordered by creation date
   */
  async getCampaignResourcesOrdered(campaignId: string): Promise<any[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM campaign_resources WHERE campaign_id = ? ORDER BY created_at DESC"
      )
      .bind(campaignId)
      .all();

    return result.results || [];
  }
}
