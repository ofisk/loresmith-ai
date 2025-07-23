import type { D1Database, VectorizeIndex } from "@cloudflare/workers-types";

export interface CampaignContextChunk {
  id: string;
  campaign_id: string;
  context_id: string;
  chunk_text: string;
  chunk_index: number;
  embedding_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface CampaignContext {
  id: string;
  campaign_id: string;
  context_type: string;
  title: string;
  content: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CampaignCharacter {
  id: string;
  campaign_id: string;
  character_name: string;
  character_class?: string;
  character_level: number;
  character_race?: string;
  backstory?: string;
  personality_traits?: string;
  goals?: string;
  relationships?: string[];
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CampaignSearchResult {
  chunk: CampaignContextChunk;
  score: number;
  metadata?: Record<string, any>;
  contextType?: string;
  title?: string;
}

export class CampaignRAGService {
  constructor(
    private db: D1Database,
    private vectorize: VectorizeIndex,
    private openaiApiKey?: string
  ) {}

  /**
   * Process campaign context by chunking content and generating embeddings
   */
  async processCampaignContext(
    contextId: string,
    campaignId: string,
    content: string,
    contextType: string,
    title: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // Chunk the content
      const chunks = this.chunkText(content, 800, 150);

      // Generate embeddings for each chunk
      const embeddings = await this.generateEmbeddings(
        chunks.map((chunk) => chunk.text)
      );

      // Store chunks and embeddings
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];

        // Store chunk in D1
        const chunkId = crypto.randomUUID();
        await this.db
          .prepare(
            "INSERT INTO campaign_context_chunks (id, campaign_id, context_id, chunk_text, chunk_index, embedding_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          )
          .bind(
            chunkId,
            campaignId,
            contextId,
            chunk.text,
            chunk.index,
            chunkId, // Use chunk ID as embedding ID
            JSON.stringify({
              context_type: contextType,
              title,
              ...chunk.metadata,
              ...metadata,
            }),
            new Date().toISOString()
          )
          .run();

        // Store embedding in Vectorize
        try {
          await this.vectorize.insert([
            {
              id: chunkId,
              values: embedding,
              metadata: {
                campaign_id: campaignId,
                context_id: contextId,
                context_type: contextType,
                title,
                chunk_index: chunk.index,
                ...chunk.metadata,
                ...metadata,
              },
            },
          ]);
        } catch (error) {
          console.warn(
            `Skipping Vectorize insert in local development: ${error}`
          );
          // Continue processing even if Vectorize fails
        }
      }

      console.log(
        `Successfully processed campaign context ${contextId} with ${chunks.length} chunks`
      );
    } catch (error) {
      console.error("Error processing campaign context:", error);
      throw error;
    }
  }

  /**
   * Search for relevant campaign context across all stored information
   */
  async searchCampaignContext(
    campaignId: string,
    query: string,
    limit: number = 10
  ): Promise<CampaignSearchResult[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbeddings([query]);

      // Search in Vectorize
      const searchResults = await this.vectorize.query(queryEmbedding[0], {
        topK: limit,
        returnMetadata: true,
        filter: {
          campaign_id: campaignId,
        },
      });

      // Get chunk details from D1
      const chunkIds = searchResults.matches.map((match) => match.id);
      const chunks = await this.getChunksByIds(chunkIds);

      // Combine results
      return searchResults.matches.map((match) => {
        const chunk = chunks.find((c) => c.id === match.id);
        return {
          chunk: chunk!,
          score: match.score,
          metadata: match.metadata,
          contextType: match.metadata?.context_type as string | undefined,
          title: match.metadata?.title as string | undefined,
        };
      });
    } catch (error) {
      console.error("Error searching campaign context:", error);
      throw error;
    }
  }

  /**
   * Get intelligent suggestions based on campaign context and characters
   */
  async getIntelligentSuggestions(
    campaignId: string,
    suggestionType: string,
    specificFocus?: string,
    context?: any[],
    characters?: any[],
    resources?: any[]
  ): Promise<{
    suggestions: Array<{
      id: number;
      type: string;
      suggestion: string;
      specificFocus?: string;
      contextRelevance: string;
      relatedContext?: string[];
    }>;
    contextCount: number;
    characterCount: number;
    resourceCount: number;
  }> {
    try {
      // Get campaign data if not provided
      const contextData =
        context ||
        (
          await this.db
            .prepare(
              "SELECT * FROM campaign_context WHERE campaign_id = ? ORDER BY created_at DESC"
            )
            .bind(campaignId)
            .all()
        ).results;

      const charactersData =
        characters ||
        (
          await this.db
            .prepare(
              "SELECT * FROM campaign_characters WHERE campaign_id = ? ORDER BY created_at DESC"
            )
            .bind(campaignId)
            .all()
        ).results;

      const resourcesData =
        resources ||
        (
          await this.db
            .prepare(
              "SELECT * FROM campaign_resources WHERE campaign_id = ? ORDER BY created_at DESC"
            )
            .bind(campaignId)
            .all()
        ).results;

      // Generate base suggestions
      const baseSuggestions = this.generateBaseSuggestions(
        suggestionType,
        specificFocus
      );

      // Enhance suggestions with context
      const enhancedSuggestions = baseSuggestions.map((suggestion, index) => {
        const relatedContext = this.findRelatedContext(
          suggestion.suggestion,
          contextData,
          charactersData
        );

        return {
          ...suggestion,
          id: index + 1,
          relatedContext,
          contextRelevance:
            relatedContext.length > 0
              ? `Based on ${relatedContext.length} relevant context entries`
              : "General suggestion based on campaign planning best practices",
        };
      });

      return {
        suggestions: enhancedSuggestions,
        contextCount: contextData.length,
        characterCount: charactersData.length,
        resourceCount: resourcesData.length,
      };
    } catch (error) {
      console.error("Error getting intelligent suggestions:", error);
      throw error;
    }
  }

  /**
   * Assess campaign readiness based on available information
   */
  async assessCampaignReadiness(campaignId: string): Promise<{
    readinessScore: number;
    recommendations: string[];
    contextCount: number;
    characterCount: number;
    resourceCount: number;
    isReady: boolean;
    missingElements: string[];
  }> {
    try {
      // Get campaign data
      const { results: context } = await this.db
        .prepare("SELECT * FROM campaign_context WHERE campaign_id = ?")
        .bind(campaignId)
        .all();

      const { results: characters } = await this.db
        .prepare("SELECT * FROM campaign_characters WHERE campaign_id = ?")
        .bind(campaignId)
        .all();

      const { results: resources } = await this.db
        .prepare("SELECT * FROM campaign_resources WHERE campaign_id = ?")
        .bind(campaignId)
        .all();

      let readinessScore = 0;
      const recommendations = [];
      const missingElements = [];

      // Assess context completeness
      const contextTypes = context.map((c) => c.context_type);

      if (contextTypes.includes("world_description")) {
        readinessScore += 20;
      } else {
        missingElements.push("World description");
        recommendations.push(
          "Add a world description to better understand your setting"
        );
      }

      if (contextTypes.includes("campaign_notes")) {
        readinessScore += 15;
      } else {
        missingElements.push("Campaign notes");
        recommendations.push(
          "Add campaign notes to track your planning progress"
        );
      }

      if (contextTypes.includes("player_preferences")) {
        readinessScore += 15;
      } else {
        missingElements.push("Player preferences");
        recommendations.push("Add player preferences to tailor the experience");
      }

      // Assess character information
      if (characters.length > 0) {
        readinessScore += 25;
        const charactersWithBackstories = characters.filter((c) => c.backstory);
        if (charactersWithBackstories.length === characters.length) {
          readinessScore += 15;
        } else {
          missingElements.push("Character backstories");
          recommendations.push(
            "Add backstories for all characters to create better story hooks"
          );
        }
      } else {
        missingElements.push("Character information");
        recommendations.push(
          "Add character information to personalize the campaign"
        );
      }

      // Assess resources
      if (resources.length > 0) {
        readinessScore += 10;
      } else {
        missingElements.push("Campaign resources");
        recommendations.push(
          "Add resources to your campaign for better planning support"
        );
      }

      return {
        readinessScore: Math.min(readinessScore, 100),
        recommendations,
        contextCount: context.length,
        characterCount: characters.length,
        resourceCount: resources.length,
        isReady: readinessScore >= 70,
        missingElements,
      };
    } catch (error) {
      console.error("Error assessing campaign readiness:", error);
      throw error;
    }
  }

  /**
   * Chunk text for processing
   */
  private chunkText(
    text: string,
    maxChunkSize: number = 800,
    overlap: number = 150
  ): Array<{ text: string; index: number; metadata?: Record<string, any> }> {
    const chunks = [];
    let index = 0;

    for (let i = 0; i < text.length; i += maxChunkSize - overlap) {
      const chunk = text.slice(i, i + maxChunkSize);
      chunks.push({
        text: chunk,
        index: index++,
        metadata: {
          start_char: i,
          end_char: Math.min(i + maxChunkSize, text.length),
        },
      });
    }

    return chunks;
  }

  /**
   * Generate embeddings for text using OpenAI
   */
  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.openaiApiKey) {
      // Return placeholder embeddings for development
      return texts.map(() =>
        new Array(1536).fill(0).map(() => Math.random() - 0.5)
      );
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: "text-embedding-3-small",
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const result = (await response.json()) as any;
    return result.data.map((item: any) => item.embedding);
  }

  /**
   * Get chunks by IDs
   */
  private async getChunksByIds(ids: string[]): Promise<CampaignContextChunk[]> {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => "?").join(",");
    const { results } = await this.db
      .prepare(
        `SELECT * FROM campaign_context_chunks WHERE id IN (${placeholders})`
      )
      .bind(...ids)
      .all();

    return results as unknown as CampaignContextChunk[];
  }

  /**
   * Generate base suggestions based on type
   */
  private generateBaseSuggestions(
    suggestionType: string,
    specificFocus?: string
  ): Array<{ type: string; suggestion: string; specificFocus?: string }> {
    const suggestions = [];

    switch (suggestionType) {
      case "session_planning":
        suggestions.push(
          "Consider the party's current level and composition when planning encounters",
          "Include a mix of combat, social, and exploration challenges",
          "Connect session events to character backstories and goals",
          "Plan for both short-term objectives and long-term story progression"
        );
        break;
      case "resource_recommendations":
        suggestions.push(
          "Upload monster manuals for encounter planning",
          "Add adventure modules that match your campaign tone",
          "Include spell books for magic-heavy campaigns",
          "Consider adding world-building guides for setting development"
        );
        break;
      case "plot_hooks":
        suggestions.push(
          "Use character backstories to create personal storylines",
          "Connect character goals to main plot threads",
          "Create NPCs that relate to character relationships",
          "Develop conflicts that challenge character values and beliefs"
        );
        break;
      case "character_development":
        suggestions.push(
          "Plan character arcs that align with their goals",
          "Create opportunities for character growth",
          "Include challenges that test character values",
          "Develop relationships between party members"
        );
        break;
      case "world_building":
        suggestions.push(
          "Develop locations that connect to character backgrounds",
          "Create factions that align with character motivations",
          "Build history that impacts current events",
          "Design cultures and societies that feel authentic"
        );
        break;
      case "npc_suggestions":
        suggestions.push(
          "Create NPCs that challenge character beliefs",
          "Include mentors that can guide character development",
          "Add antagonists that relate to character backstories",
          "Develop allies who can provide support and resources"
        );
        break;
      case "encounter_ideas":
        suggestions.push(
          "Design encounters that test character abilities",
          "Include social challenges that require roleplaying",
          "Create puzzles that relate to character knowledge",
          "Balance combat encounters for your party's level"
        );
        break;
      case "general_planning":
        suggestions.push(
          "Balance combat and non-combat encounters",
          "Include opportunities for character interaction",
          "Plan for both short-term and long-term story arcs",
          "Consider player preferences and boundaries"
        );
        break;
    }

    return suggestions.map((suggestion) => ({
      type: suggestionType,
      suggestion,
      specificFocus,
    }));
  }

  /**
   * Find context related to a suggestion
   */
  private findRelatedContext(
    suggestion: string,
    context: any[],
    characters: any[]
  ): string[] {
    const related = [];
    const lowerSuggestion = suggestion.toLowerCase();

    // Check context entries
    for (const ctx of context) {
      const lowerContent = ctx.content.toLowerCase();
      const lowerTitle = ctx.title.toLowerCase();

      if (
        lowerSuggestion.includes("character") &&
        (lowerContent.includes("character") || lowerTitle.includes("character"))
      ) {
        related.push(`${ctx.title}: ${ctx.content.substring(0, 100)}...`);
      }

      if (
        lowerSuggestion.includes("world") &&
        (lowerContent.includes("world") || lowerTitle.includes("world"))
      ) {
        related.push(`${ctx.title}: ${ctx.content.substring(0, 100)}...`);
      }

      if (
        lowerSuggestion.includes("backstory") &&
        (lowerContent.includes("backstory") || lowerTitle.includes("backstory"))
      ) {
        related.push(`${ctx.title}: ${ctx.content.substring(0, 100)}...`);
      }
    }

    // Check character information
    for (const char of characters) {
      if (lowerSuggestion.includes("character") && char.backstory) {
        related.push(
          `${char.character_name}'s backstory: ${char.backstory.substring(0, 100)}...`
        );
      }

      if (lowerSuggestion.includes("goals") && char.goals) {
        related.push(
          `${char.character_name}'s goals: ${char.goals.substring(0, 100)}...`
        );
      }
    }

    return related.slice(0, 3); // Limit to 3 related items
  }
}
