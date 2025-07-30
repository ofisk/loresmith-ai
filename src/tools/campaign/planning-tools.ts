import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../constants";
import { commonSchemas, createToolError, createToolSuccess } from "../utils";

// Campaign planning tools

export const planCampaignSession = tool({
  description:
    "Help plan a specific D&D session with detailed suggestions for encounters, NPCs, and story elements",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    sessionType: z
      .string()
      .optional()
      .describe("Type of session (combat, social, exploration, etc.)"),
    playerLevel: z
      .number()
      .optional()
      .describe("Average player level for encounter balancing"),
    sessionLength: z
      .string()
      .optional()
      .describe("Expected session length (2 hours, 4 hours, etc.)"),
    context: z
      .string()
      .optional()
      .describe("Additional context about the campaign or session goals"),
    jwt: commonSchemas.jwt,
  }),
  execute: async ({
    campaignId,
    sessionType,
    playerLevel,
    sessionLength,
    context,
    jwt,
  }): Promise<ToolResult> => {
    console.log("[Tool] planCampaignSession received:", {
      campaignId,
      sessionType,
      playerLevel,
      sessionLength,
      context,
    });
    try {
      // First, get campaign details to understand the context
      const campaignResponse = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(campaignId)),
        {
          method: "GET",
          headers: {
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
        }
      );

      if (!campaignResponse.ok) {
        return createToolError(
          `Failed to get campaign details: ${campaignResponse.status}`,
          { error: `HTTP ${campaignResponse.status}` }
        );
      }

      const campaignData = (await campaignResponse.json()) as {
        campaign?: {
          name: string;
          [key: string]: any;
        };
      };

      // Search for relevant resources based on campaign context
      const searchQuery = `session planning ${sessionType || ""} ${context || ""}`;
      const searchResponse = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.RAG.SEARCH),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({
            query: searchQuery,
            limit: 3,
          }),
        }
      );

      let resourceSuggestions: any[] = [];
      if (searchResponse.ok) {
        const searchData = (await searchResponse.json()) as {
          results?: any[];
        };
        resourceSuggestions = searchData.results || [];
      }

      // Generate session planning suggestions
      const sessionPlan = {
        campaignName: campaignData.campaign?.name || "Unknown Campaign",
        sessionType: sessionType || "balanced",
        playerLevel: playerLevel || 1,
        sessionLength: sessionLength || "3-4 hours",
        suggestedEncounters: [] as Array<{
          type: string;
          description: string;
          resources: string;
        }>,
        resourceRecommendations: resourceSuggestions,
        planningNotes: [] as string[],
      };

      // Add specific suggestions based on session type
      if (sessionType?.toLowerCase().includes("combat")) {
        sessionPlan.suggestedEncounters.push({
          type: "Combat",
          description: "Consider 2-3 combat encounters with varying difficulty",
          resources: "Search for monsters appropriate to player level",
        });
      } else if (sessionType?.toLowerCase().includes("social")) {
        sessionPlan.suggestedEncounters.push({
          type: "Social",
          description:
            "Focus on NPC interactions and role-playing opportunities",
          resources: "Look for NPC stat blocks and social encounter guidelines",
        });
      } else {
        sessionPlan.suggestedEncounters.push({
          type: "Balanced",
          description: "Mix of combat, social, and exploration encounters",
          resources: "Variety of monsters, NPCs, and location descriptions",
        });
      }

      return createToolSuccess(
        `Session planning suggestions for ${sessionPlan.campaignName}: ${sessionPlan.suggestedEncounters.length} encounter types suggested with ${resourceSuggestions.length} relevant resources found.`,
        {
          sessionPlan,
          campaignContext: campaignData,
          resourceCount: resourceSuggestions.length,
        }
      );
    } catch (error) {
      console.error("Error planning campaign session:", error);
      return createToolError(
        `Failed to plan session: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});

export const suggestCampaignResources = tool({
  description:
    "Suggest specific resources from the PDF library that would be helpful for a particular campaign or session",
  parameters: z.object({
    campaignType: z
      .string()
      .describe("Type of campaign (horror, adventure, political, etc.)"),
    playerLevel: z
      .number()
      .optional()
      .describe("Player level for appropriate resource suggestions"),
    specificNeeds: z
      .string()
      .optional()
      .describe("Specific needs or themes for the campaign"),
    jwt: commonSchemas.jwt,
  }),
  execute: async ({
    campaignType,
    playerLevel,
    specificNeeds,
    jwt,
  }): Promise<ToolResult> => {
    console.log("[Tool] suggestCampaignResources received:", {
      campaignType,
      playerLevel,
      specificNeeds,
    });
    try {
      // Build search queries based on campaign type and needs
      const searchQueries = [
        campaignType,
        specificNeeds,
        playerLevel ? `level ${playerLevel}` : "",
      ].filter(Boolean);

      const searchQuery = searchQueries.join(" ");

      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.RAG.SEARCH),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({
            query: searchQuery,
            limit: 5,
          }),
        }
      );

      if (!response.ok) {
        return createToolError(
          `Failed to search for resources: ${response.status}`,
          { error: `HTTP ${response.status}` }
        );
      }

      const result = (await response.json()) as {
        results?: Array<{
          chunk: {
            file_key: string;
            chunk_text: string;
          };
          score: number;
        }>;
      };

      if (!result.results || result.results.length === 0) {
        return createToolSuccess(
          `No specific resources found for ${campaignType} campaigns. Consider uploading more ${campaignType}-themed materials to your library.`,
          { results: [], empty: true }
        );
      }

      // Group and categorize suggestions
      const suggestions = result.results.reduce((acc: any, item) => {
        const fileName = item.chunk.file_key.split("/").pop() || "Unknown PDF";
        const category = categorizeResource(fileName, item.chunk.chunk_text);

        if (!acc[category]) {
          acc[category] = [];
        }

        acc[category].push({
          fileName,
          relevance: item.score,
          excerpt: `${item.chunk.chunk_text.substring(0, 200)}...`,
          reason: explainRelevance(campaignType, item.chunk.chunk_text),
        });

        return acc;
      }, {});

      return createToolSuccess(
        `Found ${result.results.length} relevant resources for ${campaignType} campaigns across ${Object.keys(suggestions).length} categories.`,
        {
          suggestions,
          campaignType,
          playerLevel,
          specificNeeds,
          totalResults: result.results.length,
        }
      );
    } catch (error) {
      console.error("Error suggesting campaign resources:", error);
      return createToolError(
        `Failed to suggest resources: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});

// Helper functions for resource categorization and explanation
function categorizeResource(fileName: string, content: string): string {
  const lowerFileName = fileName.toLowerCase();
  const lowerContent = content.toLowerCase();

  if (lowerFileName.includes("monster") || lowerContent.includes("monster")) {
    return "Monsters & Enemies";
  }
  if (lowerFileName.includes("spell") || lowerContent.includes("spell")) {
    return "Spells & Magic";
  }
  if (
    lowerFileName.includes("adventure") ||
    lowerContent.includes("adventure")
  ) {
    return "Adventures & Modules";
  }
  if (lowerFileName.includes("world") || lowerContent.includes("world")) {
    return "World Building";
  }
  if (lowerFileName.includes("npc") || lowerContent.includes("npc")) {
    return "NPCs & Characters";
  }
  return "General Resources";
}

function explainRelevance(campaignType: string, content: string): string {
  const lowerContent = content.toLowerCase();
  const lowerType = campaignType.toLowerCase();

  if (
    lowerType.includes("horror") &&
    (lowerContent.includes("horror") || lowerContent.includes("fear"))
  ) {
    return "Contains horror-themed content perfect for creating atmospheric encounters";
  }
  if (
    lowerType.includes("political") &&
    (lowerContent.includes("noble") || lowerContent.includes("court"))
  ) {
    return "Includes political intrigue elements suitable for court-based campaigns";
  }
  if (
    lowerType.includes("adventure") &&
    (lowerContent.includes("quest") || lowerContent.includes("adventure"))
  ) {
    return "Provides adventure hooks and quest structures";
  }
  return "Relevant content that could enhance your campaign";
}
