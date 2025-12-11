import type { Env } from "@/middleware/auth";
import { getDAOFactory } from "@/dao/dao-factory";

/**
 * Service to sync character_backstory entries from campaign_context to entities table
 * This ensures player characters are available in the entity graph for Leiden algorithm
 */
export class CharacterEntitySyncService {
  constructor(private env: Env) {}

  /**
   * Sync a character_backstory entry to the entities table
   * Creates or updates the entity to match the character_backstory entry
   */
  async syncCharacterBackstoryToEntity(
    campaignId: string,
    contextId: string,
    characterName: string,
    backstoryContent: string,
    metadata?: any
  ): Promise<void> {
    const daoFactory = getDAOFactory(this.env);
    const entityDAO = daoFactory.entityDAO;

    // Entity ID format: ${campaignId}_${characterName slug}
    // Use contextId as part of the entity ID to ensure uniqueness
    const entityId = `${campaignId}_${contextId}`;

    // Check if entity already exists
    const existingEntity = await entityDAO.getEntityById(entityId);

    // Prepare entity content
    const entityContent = {
      id: entityId,
      type: "character",
      name: characterName,
      summary: backstoryContent.substring(0, 500), // First 500 chars as summary
      backstory: backstoryContent,
      source: {
        type: "campaign_context",
        id: contextId,
      },
      ...(metadata || {}),
    };

    if (existingEntity) {
      // Update existing entity
      await entityDAO.updateEntity(entityId, {
        name: characterName,
        content: entityContent,
        metadata: {
          ...((existingEntity.metadata as Record<string, unknown>) || {}),
          sourceType: "campaign_context",
          sourceId: contextId,
          ...(metadata || {}),
        },
      });
    } else {
      // Create new entity
      await entityDAO.createEntity({
        id: entityId,
        campaignId,
        entityType: "player_characters",
        name: characterName,
        content: entityContent,
        metadata: {
          sourceType: "campaign_context",
          sourceId: contextId,
          ...(metadata || {}),
        },
        sourceType: "campaign_context",
        sourceId: contextId,
      });
    }

    console.log(
      `[CharacterEntitySync] Synced character_backstory ${contextId} to entity ${entityId}`
    );
  }

  /**
   * Sync all character_backstory entries for a campaign to entities table
   */
  async syncAllCharacterBackstories(campaignId: string): Promise<void> {
    const result = await this.env.DB.prepare(
      "SELECT * FROM campaign_context WHERE campaign_id = ? AND context_type = 'character_backstory'"
    )
      .bind(campaignId)
      .all();

    const entries = (result.results || []) as Array<{
      id: string;
      title: string;
      content: string;
      metadata: string | null;
    }>;

    for (const entry of entries) {
      const metadata = entry.metadata ? JSON.parse(entry.metadata) : null;
      await this.syncCharacterBackstoryToEntity(
        campaignId,
        entry.id,
        entry.title, // character name is stored as title
        entry.content,
        metadata
      );
    }

    console.log(
      `[CharacterEntitySync] Synced ${entries.length} character_backstory entries for campaign ${campaignId}`
    );
  }
}
