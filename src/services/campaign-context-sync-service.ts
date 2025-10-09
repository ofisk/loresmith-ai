import type { Env } from "../middleware/auth";
import { R2Helper } from "../lib/r2";

/**
 * Service to sync campaign context (characters, resources, context) to AutoRAG as approved shards
 * This ensures that all campaign content is searchable via AutoRAG
 */
export class CampaignContextSyncService {
  private r2Helper: R2Helper;

  constructor(env: Env) {
    this.r2Helper = new R2Helper(env);
  }

  /**
   * Sync a campaign character to AutoRAG as an approved shard
   */
  async syncCharacterToAutoRAG(
    campaignId: string,
    characterId: string,
    characterName: string,
    characterData: any
  ): Promise<void> {
    const campaignBasePath = `campaigns/${campaignId}`;

    // Create shard from character data
    const shard = {
      id: characterId,
      text: this.formatCharacterAsText(characterName, characterData),
      metadata: {
        entityType: "character",
        characterName,
        campaignId,
        sourceType: "campaign_context",
        createdAt: new Date().toISOString(),
      },
      sourceRef: {
        type: "character",
        id: characterId,
        meta: {
          fileName: `Character: ${characterName}`,
          campaignId,
        },
      },
    };

    // Store directly in approved folder (user-created content is pre-approved)
    const approvedKey = `${campaignBasePath}/context/approved/${characterId}.json`;
    await this.r2Helper.put(
      approvedKey,
      new TextEncoder().encode(JSON.stringify(shard)).buffer,
      "application/json"
    );

    console.log(
      `[CampaignContextSync] Synced character to AutoRAG: ${approvedKey}`
    );
  }

  /**
   * Sync campaign context to AutoRAG as an approved shard
   */
  async syncContextToAutoRAG(
    campaignId: string,
    contextId: string,
    contextType: string,
    title: string,
    content: string,
    metadata?: any
  ): Promise<void> {
    const campaignBasePath = `campaigns/${campaignId}`;

    // Create shard from context data
    const shard = {
      id: contextId,
      text: this.formatContextAsText(title, content, contextType),
      metadata: {
        entityType: "context",
        contextType,
        title,
        campaignId,
        sourceType: "campaign_context",
        ...metadata,
        createdAt: new Date().toISOString(),
      },
      sourceRef: {
        type: "context",
        id: contextId,
        meta: {
          fileName: `Context: ${title}`,
          campaignId,
          contextType,
        },
      },
    };

    // Store directly in approved folder (user-created content is pre-approved)
    const approvedKey = `${campaignBasePath}/context/approved/${contextId}.json`;
    await this.r2Helper.put(
      approvedKey,
      new TextEncoder().encode(JSON.stringify(shard)).buffer,
      "application/json"
    );

    console.log(
      `[CampaignContextSync] Synced context to AutoRAG: ${approvedKey}`
    );
  }

  /**
   * Sync a character sheet to AutoRAG as an approved shard
   */
  async syncCharacterSheetToAutoRAG(
    campaignId: string,
    sheetId: string,
    characterName: string,
    characterData: any
  ): Promise<void> {
    const campaignBasePath = `campaigns/${campaignId}`;

    // Create shard from character sheet data
    const shard = {
      id: sheetId,
      text: this.formatCharacterSheetAsText(characterName, characterData),
      metadata: {
        entityType: "character_sheet",
        characterName,
        campaignId,
        sourceType: "campaign_context",
        createdAt: new Date().toISOString(),
      },
      sourceRef: {
        type: "character_sheet",
        id: sheetId,
        meta: {
          fileName: `Character Sheet: ${characterName}`,
          campaignId,
        },
      },
    };

    // Store directly in approved folder (user-created content is pre-approved)
    const approvedKey = `${campaignBasePath}/context/approved/${sheetId}.json`;
    await this.r2Helper.put(
      approvedKey,
      new TextEncoder().encode(JSON.stringify(shard)).buffer,
      "application/json"
    );

    console.log(
      `[CampaignContextSync] Synced character sheet to AutoRAG: ${approvedKey}`
    );
  }

  /**
   * Delete a character from AutoRAG
   */
  async deleteCharacterFromAutoRAG(
    campaignId: string,
    characterId: string
  ): Promise<void> {
    const campaignBasePath = `campaigns/${campaignId}`;
    const approvedKey = `${campaignBasePath}/context/approved/${characterId}.json`;

    await this.r2Helper.delete(approvedKey);
    console.log(
      `[CampaignContextSync] Deleted character from AutoRAG: ${approvedKey}`
    );
  }

  /**
   * Delete context from AutoRAG
   */
  async deleteContextFromAutoRAG(
    campaignId: string,
    contextId: string
  ): Promise<void> {
    const campaignBasePath = `campaigns/${campaignId}`;
    const approvedKey = `${campaignBasePath}/context/approved/${contextId}.json`;

    await this.r2Helper.delete(approvedKey);
    console.log(
      `[CampaignContextSync] Deleted context from AutoRAG: ${approvedKey}`
    );
  }

  /**
   * Delete character sheet from AutoRAG
   */
  async deleteCharacterSheetFromAutoRAG(
    campaignId: string,
    sheetId: string
  ): Promise<void> {
    const campaignBasePath = `campaigns/${campaignId}`;
    const approvedKey = `${campaignBasePath}/context/approved/${sheetId}.json`;

    await this.r2Helper.delete(approvedKey);
    console.log(
      `[CampaignContextSync] Deleted character sheet from AutoRAG: ${approvedKey}`
    );
  }

  /**
   * Format character data as searchable text
   */
  private formatCharacterAsText(
    characterName: string,
    characterData: any
  ): string {
    const data =
      typeof characterData === "string"
        ? JSON.parse(characterData)
        : characterData;

    let text = `Character: ${characterName}\n\n`;

    if (data.backstory) {
      text += `Backstory: ${data.backstory}\n\n`;
    }

    if (data.personality_traits) {
      text += `Personality Traits: ${data.personality_traits}\n\n`;
    }

    if (data.goals) {
      text += `Goals: ${data.goals}\n\n`;
    }

    if (data.notes) {
      text += `Notes: ${data.notes}\n\n`;
    }

    // Add any other fields from character data
    for (const [key, value] of Object.entries(data)) {
      if (
        !["backstory", "personality_traits", "goals", "notes"].includes(key) &&
        value
      ) {
        text += `${key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}: ${value}\n\n`;
      }
    }

    return text.trim();
  }

  /**
   * Format context data as searchable text
   */
  private formatContextAsText(
    title: string,
    content: string,
    contextType: string
  ): string {
    return `${contextType.toUpperCase()}: ${title}\n\n${content}`;
  }

  /**
   * Create a staging shard for conversational context (requires user approval)
   * This is for AI-detected context that should go through the review process
   */
  async createStagingShard(
    campaignId: string,
    noteId: string,
    noteTitle: string,
    noteContent: string,
    noteType: string = "general",
    confidence: number = 0.8,
    sourceMessageId?: string
  ): Promise<{ stagingKey: string; shard: any }> {
    const campaignBasePath = `campaigns/${campaignId}`;

    // Create shard from detected context
    const shard = {
      id: noteId,
      text: noteContent,
      metadata: {
        entityType: "conversational_context",
        noteType,
        title: noteTitle,
        campaignId,
        sourceType: "ai_detected",
        confidence,
        sourceMessageId,
        query: noteTitle, // For consistency with file-based shards
        createdAt: new Date().toISOString(),
      },
      sourceRef: {
        type: "conversation",
        id: sourceMessageId || noteId,
        meta: {
          fileName: `Conversation: ${noteTitle}`,
          campaignId,
          noteType,
          detectedFromConversation: true,
        },
      },
    };

    // Store in STAGING folder (requires user approval)
    const stagingKey = `${campaignBasePath}/conversation/staging/${noteId}.json`;
    await this.r2Helper.put(
      stagingKey,
      new TextEncoder().encode(JSON.stringify(shard)).buffer,
      "application/json"
    );

    console.log(
      `[CampaignContextSync] Created staging shard for review: ${stagingKey}`
    );

    return { stagingKey, shard };
  }

  /**
   * Sync general campaign notes/context (for on-the-fly user input)
   * This is for capturing decisions, ideas, and other nebulous campaign information
   * Pre-approved content (e.g., campaign title/description) goes directly to approved
   */
  async syncCampaignNote(
    campaignId: string,
    noteId: string,
    noteTitle: string,
    noteContent: string,
    noteType: string = "general"
  ): Promise<void> {
    const campaignBasePath = `campaigns/${campaignId}`;

    // Create shard from note
    const shard = {
      id: noteId,
      text: `${noteTitle}\n\n${noteContent}`,
      metadata: {
        entityType: "campaign_note",
        noteType,
        title: noteTitle,
        campaignId,
        sourceType: "user_generated",
        createdAt: new Date().toISOString(),
      },
      sourceRef: {
        type: "campaign_note",
        id: noteId,
        meta: {
          fileName: `Note: ${noteTitle}`,
          campaignId,
          noteType,
        },
      },
    };

    // Store directly in approved folder (user-created content is pre-approved)
    const approvedKey = `${campaignBasePath}/context/approved/${noteId}.json`;
    await this.r2Helper.put(
      approvedKey,
      new TextEncoder().encode(JSON.stringify(shard)).buffer,
      "application/json"
    );

    console.log(
      `[CampaignContextSync] Synced campaign note to AutoRAG: ${approvedKey}`
    );
  }

  /**
   * Delete a campaign note from AutoRAG
   */
  async deleteCampaignNote(campaignId: string, noteId: string): Promise<void> {
    const campaignBasePath = `campaigns/${campaignId}`;
    const approvedKey = `${campaignBasePath}/context/approved/${noteId}.json`;

    await this.r2Helper.delete(approvedKey);
    console.log(
      `[CampaignContextSync] Deleted campaign note from AutoRAG: ${approvedKey}`
    );
  }

  /**
   * Format character sheet as searchable text
   */
  private formatCharacterSheetAsText(
    characterName: string,
    characterData: any
  ): string {
    const data =
      typeof characterData === "string"
        ? JSON.parse(characterData)
        : characterData;

    let text = `Character Sheet: ${characterName}\n\n`;

    // Format based on common character sheet fields
    if (data.class) {
      text += `Class: ${data.class}\n`;
    }

    if (data.level) {
      text += `Level: ${data.level}\n`;
    }

    if (data.race) {
      text += `Race: ${data.race}\n`;
    }

    if (data.background) {
      text += `Background: ${data.background}\n`;
    }

    text += "\n";

    // Add abilities
    if (data.abilities) {
      text += "Abilities:\n";
      for (const [ability, score] of Object.entries(data.abilities)) {
        text += `  ${ability}: ${score}\n`;
      }
      text += "\n";
    }

    // Add skills
    if (data.skills) {
      text += "Skills:\n";
      for (const [skill, proficient] of Object.entries(data.skills)) {
        if (proficient) {
          text += `  ${skill}\n`;
        }
      }
      text += "\n";
    }

    // Add equipment
    if (data.equipment) {
      text += `Equipment: ${Array.isArray(data.equipment) ? data.equipment.join(", ") : data.equipment}\n\n`;
    }

    // Add features and traits
    if (data.features) {
      text += `Features and Traits: ${data.features}\n\n`;
    }

    // Add any other fields
    for (const [key, value] of Object.entries(data)) {
      if (
        ![
          "class",
          "level",
          "race",
          "background",
          "abilities",
          "skills",
          "equipment",
          "features",
        ].includes(key) &&
        value
      ) {
        text += `${key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}: ${JSON.stringify(value)}\n\n`;
      }
    }

    return text.trim();
  }
}
