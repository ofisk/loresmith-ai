import type { CampaignCharacter, CampaignDAO } from "@/dao/campaign-dao";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";

export interface CampaignSuggestion {
  id: number;
  type: string;
  suggestion: string;
  specificFocus?: string;
  contextRelevance: string;
  relatedContext?: string[];
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

export type { CampaignCharacter } from "@/dao/campaign-dao";

export class CampaignService {
  private campaignDAO: CampaignDAO;

  constructor(env: Env) {
    this.campaignDAO = getDAOFactory(env).campaignDAO;
  }

  /**
   * Get intelligent suggestions based on campaign context and characters
   */
  async getIntelligentSuggestions(
    campaignId: string,
    suggestionType: string,
    specificFocus?: string,
    context?: CampaignContext[],
    characters?: CampaignCharacter[],
    resources?: any[]
  ): Promise<{
    suggestions: CampaignSuggestion[];
    contextCount: number;
    characterCount: number;
    resourceCount: number;
  }> {
    try {
      // Get campaign data if not provided
      const contextData =
        context || (await this.campaignDAO.getCampaignContext(campaignId));
      const charactersData =
        characters ||
        (await this.campaignDAO.getCampaignCharacters(campaignId));
      const resourcesData =
        resources || (await this.campaignDAO.getCampaignResources(campaignId));

      // Generate base suggestions
      const baseSuggestions = this.generateBaseSuggestions(
        suggestionType,
        specificFocus
      );

      // Enhance suggestions with context
      const enhancedSuggestions = baseSuggestions.map((suggestion, index) => {
        const relatedContext = this.findRelatedContext(
          suggestion.suggestion,
          contextData as CampaignContext[],
          charactersData as CampaignCharacter[]
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
    context: CampaignContext[],
    characters: CampaignCharacter[]
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
      if (lowerSuggestion.includes("character")) {
        // Character data is stored as JSON string, so we can't easily access specific fields
        related.push(`${char.character_name}: Character data available`);
      }
    }

    return related.slice(0, 3); // Limit to 3 related items
  }
}
