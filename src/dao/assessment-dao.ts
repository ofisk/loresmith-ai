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
   */
  async getCampaignContext(campaignId: string): Promise<any[]> {
    const result = await this.db
      .prepare("SELECT * FROM campaign_context WHERE campaign_id = ?")
      .bind(campaignId)
      .all();

    return result.results || [];
  }

  /**
   * Get campaign characters for readiness assessment
   * Includes:
   * - campaign_characters table entries
   * - entities with entityType 'npcs' or 'characters'
   * - campaign_context entries with context_type 'character_backstory'
   */
  async getCampaignCharacters(campaignId: string): Promise<any[]> {
    // Get characters from campaign_characters table
    const campaignCharsResult = await this.db
      .prepare("SELECT * FROM campaign_characters WHERE campaign_id = ?")
      .bind(campaignId)
      .all();

    // Get characters from entities table (NPCs and character entities)
    // Include both singular 'character' and plural 'characters', plus 'character_sheets'
    // The entity extraction can use either form depending on context
    const entitiesResult = await this.db
      .prepare(
        "SELECT * FROM entities WHERE campaign_id = ? AND entity_type IN ('npcs', 'character', 'characters', 'character_sheets')"
      )
      .bind(campaignId)
      .all();

    // Get player characters from campaign_context table (character_backstory entries)
    const contextCharsResult = await this.db
      .prepare(
        "SELECT * FROM campaign_context WHERE campaign_id = ? AND context_type = 'character_backstory'"
      )
      .bind(campaignId)
      .all();

    // Combine all results
    const campaignChars = (campaignCharsResult.results || []) as any[];
    const entityChars = (entitiesResult.results || []) as any[];
    const contextChars = (contextCharsResult.results || []) as any[];

    return [...campaignChars, ...entityChars, ...contextChars];
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
        FROM pdf_metadata 
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
    moduleName: string
  ): Promise<void> {
    for (const npc of npcs) {
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
            moduleName,
          })
        )
        .run();
    }
  }

  /**
   * Store locations from module analysis
   */
  async storeLocations(
    campaignId: string,
    locations: any[],
    moduleName: string
  ): Promise<void> {
    for (const location of locations) {
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
            moduleName,
          })
        )
        .run();
    }
  }

  /**
   * Store plot hooks from module analysis
   */
  async storePlotHooks(
    campaignId: string,
    plotHooks: any[],
    moduleName: string
  ): Promise<void> {
    for (const plotHook of plotHooks) {
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
            moduleName,
          })
        )
        .run();
    }
  }

  /**
   * Store story beats from module analysis
   */
  async storeStoryBeats(
    campaignId: string,
    storyBeats: any[],
    moduleName: string
  ): Promise<void> {
    for (const storyBeat of storyBeats) {
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
            moduleName,
          })
        )
        .run();
    }
  }

  /**
   * Store key items from module analysis
   */
  async storeKeyItems(
    campaignId: string,
    keyItems: any[],
    moduleName: string
  ): Promise<void> {
    for (const item of keyItems) {
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
            moduleName,
          })
        )
        .run();
    }
  }

  /**
   * Store conflicts from module analysis
   */
  async storeConflicts(
    campaignId: string,
    conflicts: any[],
    moduleName: string
  ): Promise<void> {
    for (const conflict of conflicts) {
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
            moduleName,
          })
        )
        .run();
    }
  }

  /**
   * Get campaign context ordered by creation date
   */
  async getCampaignContextOrdered(campaignId: string): Promise<any[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM campaign_context WHERE campaign_id = ? ORDER BY created_at DESC"
      )
      .bind(campaignId)
      .all();

    return result.results || [];
  }

  /**
   * Get campaign characters ordered by creation date
   * Includes campaign_characters, entities, and character_backstory entries
   */
  async getCampaignCharactersOrdered(campaignId: string): Promise<any[]> {
    // Use the same logic as getCampaignCharacters but return all results
    // (ordering is less important for assessment, but we'll keep it for consistency)
    return await this.getCampaignCharacters(campaignId);
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
