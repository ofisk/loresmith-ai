import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, AUTH_CODES, type ToolResult } from "../constants";
import { extractAuthFromHeader } from "../lib/auth";
import { authenticatedFetch, handleAuthError } from "../lib/toolAuth";

// Helper function to get environment from context
function getEnvFromContext(context: any): any {
  if (context?.env) {
    return context.env;
  }
  if (typeof globalThis !== "undefined" && "env" in globalThis) {
    return (globalThis as any).env;
  }
  return null;
}

// Tool to store campaign context (character backstories, world descriptions, etc.)
const storeCampaignContext = tool({
  description:
    "Store campaign context information like character backstories, world descriptions, campaign notes, or session notes for intelligent suggestions",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign to store context for"),
    contextType: z
      .enum([
        "character_backstory",
        "world_description",
        "campaign_notes",
        "session_notes",
        "npc_description",
        "location_description",
        "plot_hooks",
        "player_preferences",
      ])
      .describe("The type of context being stored"),
    title: z.string().describe("A descriptive title for this context entry"),
    content: z
      .string()
      .describe(
        "The actual content to store (character backstory, world description, etc.)"
      ),
    metadata: z
      .record(z.any())
      .optional()
      .describe("Additional metadata for this context entry"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async (
    { campaignId, contextType, title, content, metadata, jwt },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] storeCampaignContext received:", {
      campaignId,
      contextType,
      title,
      content: `${content.substring(0, 100)}...`,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] storeCampaignContext - Environment found:", !!env);
      console.log("[Tool] storeCampaignContext - JWT provided:", !!jwt);
      console.log(
        "[Tool] storeCampaignContext - Context keys:",
        context ? Object.keys(context) : "no context"
      );
      console.log(
        "[Tool] storeCampaignContext - Environment keys:",
        env ? Object.keys(env) : "no env"
      );

      // If we have environment, work directly with the database
      if (env) {
        const userId = await extractUsernameFromJwt(jwt || null, env);
        console.log("[Tool] storeCampaignContext - User ID extracted:", userId);

        if (!userId) {
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: "Invalid authentication token",
            data: { error: "Authentication failed" },
          };
        }

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return {
            code: AUTH_CODES.ERROR,
            message: "Campaign not found",
            data: { error: "Campaign not found" },
          };
        }

        // Store the context
        const contextId = crypto.randomUUID();
        const now = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO campaign_context (id, campaign_id, context_type, title, content, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
          .bind(
            contextId,
            campaignId,
            contextType,
            title,
            content,
            metadata ? JSON.stringify(metadata) : null,
            now,
            now
          )
          .run();

        // Update campaign updated_at
        await env.DB.prepare("UPDATE campaigns SET updated_at = ? WHERE id = ?")
          .bind(now, campaignId)
          .run();

        console.log(
          "[Tool] Stored campaign context directly:",
          contextId,
          "type:",
          contextType
        );

        return {
          code: AUTH_CODES.SUCCESS,
          message: `Successfully stored ${contextType} context: "${title}"`,
          data: {
            id: contextId,
            contextType,
            title,
            content,
            metadata,
            createdAt: now,
          },
        };
      }

      // Otherwise, make HTTP request
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.CONTEXT(campaignId)),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            contextType,
            title,
            content,
            metadata,
          }),
        }
      );

      if (!response.ok) {
        const authError = handleAuthError(response);
        if (authError) {
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: authError,
            data: { error: `HTTP ${response.status}` },
          };
        }
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to store campaign context: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as any;
      return {
        code: AUTH_CODES.SUCCESS,
        message: `Successfully stored ${contextType} context: "${title}"`,
        data: result,
      };
    } catch (error) {
      console.error("Error storing campaign context:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Failed to store campaign context: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

// Helper function to extract username from JWT
async function extractUsernameFromJwt(
  jwt: string | null,
  env: any
): Promise<string | null> {
  if (!jwt) return null;

  try {
    const auth = await extractAuthFromHeader(`Bearer ${jwt}`, env);
    return auth?.username || null;
  } catch {
    return null;
  }
}

// Tool to retrieve campaign context for intelligent suggestions
const getCampaignContext = tool({
  description:
    "Retrieve stored campaign context to provide intelligent suggestions and recommendations",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign to retrieve context for"),
    contextType: z
      .enum([
        "character_backstory",
        "world_description",
        "campaign_notes",
        "session_notes",
        "npc_description",
        "location_description",
        "plot_hooks",
        "player_preferences",
        "all",
      ])
      .optional()
      .describe("The type of context to retrieve (default: all)"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({
    campaignId,
    contextType = "all",
    jwt,
  }): Promise<ToolResult> => {
    console.log("[Tool] getCampaignContext received:", {
      campaignId,
      contextType,
    });
    try {
      const url =
        contextType === "all"
          ? API_CONFIG.buildUrl(
              API_CONFIG.ENDPOINTS.CAMPAIGNS.CONTEXT(campaignId)
            )
          : API_CONFIG.buildUrl(
              API_CONFIG.ENDPOINTS.CAMPAIGNS.CONTEXT(campaignId) +
                `?type=${contextType}`
            );

      const response = await authenticatedFetch(url, {
        method: "GET",
        jwt,
      });

      if (!response.ok) {
        const authError = handleAuthError(response);
        if (authError) {
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: authError,
            data: { error: `HTTP ${response.status}` },
          };
        }
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to retrieve campaign context: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as any;
      return {
        code: AUTH_CODES.SUCCESS,
        message: `Retrieved ${result.context?.length || 0} context entries for campaign`,
        data: result,
      };
    } catch (error) {
      console.error("Error retrieving campaign context:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Failed to retrieve campaign context: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

// Tool to store character information
const storeCharacterInfo = tool({
  description:
    "Store detailed character information including backstory, personality, goals, and relationships for intelligent campaign suggestions",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign this character belongs to"),
    characterName: z.string().describe("The name of the character"),
    characterClass: z
      .string()
      .optional()
      .describe("The character's class (e.g., Fighter, Wizard, etc.)"),
    characterLevel: z.number().optional().describe("The character's level"),
    characterRace: z.string().optional().describe("The character's race"),
    backstory: z
      .string()
      .optional()
      .describe("The character's backstory and history"),
    personalityTraits: z
      .string()
      .optional()
      .describe("The character's personality traits and quirks"),
    goals: z
      .string()
      .optional()
      .describe("The character's goals and motivations"),
    relationships: z
      .array(z.string())
      .optional()
      .describe("Array of relationships with other characters/NPCs"),
    metadata: z
      .record(z.any())
      .optional()
      .describe("Additional character metadata"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async (
    {
      campaignId,
      characterName,
      characterClass,
      characterLevel,
      characterRace,
      backstory,
      personalityTraits,
      goals,
      relationships,
      metadata,
      jwt,
    },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] storeCharacterInfo received:", {
      campaignId,
      characterName,
      characterClass,
      characterLevel,
    });
    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] storeCharacterInfo - Environment found:", !!env);
      console.log("[Tool] storeCharacterInfo - JWT provided:", !!jwt);
      console.log(
        "[Tool] storeCharacterInfo - Context keys:",
        context ? Object.keys(context) : "no context"
      );
      console.log(
        "[Tool] storeCharacterInfo - Environment keys:",
        env ? Object.keys(env) : "no env"
      );

      // If we have environment, work directly with the database
      if (env) {
        const userId = await extractUsernameFromJwt(jwt || null, env);
        console.log("[Tool] storeCharacterInfo - User ID extracted:", userId);

        if (!userId) {
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: "Invalid authentication token",
            data: { error: "Authentication failed" },
          };
        }

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return {
            code: AUTH_CODES.ERROR,
            message: "Campaign not found",
            data: { error: "Campaign not found" },
          };
        }

        // Store the character information
        const characterId = crypto.randomUUID();
        const now = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO campaign_characters (id, campaign_id, character_name, character_class, character_level, character_race, backstory, personality_traits, goals, relationships, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
          .bind(
            characterId,
            campaignId,
            characterName,
            characterClass || null,
            characterLevel || null,
            characterRace || null,
            backstory || null,
            personalityTraits || null,
            goals || null,
            relationships ? JSON.stringify(relationships) : null,
            metadata ? JSON.stringify(metadata) : null,
            now,
            now
          )
          .run();

        // Update campaign updated_at
        await env.DB.prepare("UPDATE campaigns SET updated_at = ? WHERE id = ?")
          .bind(now, campaignId)
          .run();

        console.log(
          "[Tool] Stored character info directly:",
          characterId,
          "name:",
          characterName
        );

        return {
          code: AUTH_CODES.SUCCESS,
          message: `Successfully stored character information for ${characterName}`,
          data: {
            id: characterId,
            characterName,
            characterClass,
            characterLevel,
            characterRace,
            backstory,
            personalityTraits,
            goals,
            relationships,
            metadata,
            createdAt: now,
          },
        };
      }

      // Otherwise, make HTTP request
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CHARACTERS(campaignId)
        ),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            characterName,
            characterClass,
            characterLevel,
            characterRace,
            backstory,
            personalityTraits,
            goals,
            relationships,
            metadata,
          }),
        }
      );

      if (!response.ok) {
        const authError = handleAuthError(response);
        if (authError) {
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: authError,
            data: { error: `HTTP ${response.status}` },
          };
        }
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to store character info: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as any;
      return {
        code: AUTH_CODES.SUCCESS,
        message: `Successfully stored character information for ${characterName}`,
        data: result,
      };
    } catch (error) {
      console.error("Error storing character info:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Failed to store character info: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

// Tool to get intelligent suggestions based on campaign context
const getIntelligentSuggestions = tool({
  description:
    "Get intelligent suggestions for campaign planning based on stored context, character information, and available resources",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign to get suggestions for"),
    suggestionType: z
      .enum([
        "session_planning",
        "resource_recommendations",
        "plot_hooks",
        "character_development",
        "world_building",
        "npc_suggestions",
        "encounter_ideas",
        "general_planning",
      ])
      .describe("The type of suggestions to generate"),
    specificFocus: z
      .string()
      .optional()
      .describe(
        "Specific focus area for suggestions (e.g., 'combat encounters', 'social interactions')"
      ),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({
    campaignId,
    suggestionType,
    specificFocus,
    jwt,
  }): Promise<ToolResult> => {
    console.log("[Tool] getIntelligentSuggestions received:", {
      campaignId,
      suggestionType,
      specificFocus,
    });
    try {
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.SUGGESTIONS(campaignId)
        ),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            suggestionType,
            specificFocus,
          }),
        }
      );

      if (!response.ok) {
        const authError = handleAuthError(response);
        if (authError) {
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: authError,
            data: { error: `HTTP ${response.status}` },
          };
        }
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to get intelligent suggestions: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as any;
      return {
        code: AUTH_CODES.SUCCESS,
        message: `Generated ${result.suggestions?.length || 0} intelligent suggestions for ${suggestionType}`,
        data: result,
      };
    } catch (error) {
      console.error("Error getting intelligent suggestions:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Failed to get intelligent suggestions: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

// Tool to assess campaign readiness and suggest next steps
const assessCampaignReadiness = tool({
  description:
    "Assess the current state of campaign planning and suggest what additional information or resources would be helpful",
  parameters: z.object({
    campaignId: z.string().describe("The ID of the campaign to assess"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ campaignId, jwt }): Promise<ToolResult> => {
    console.log("[Tool] assessCampaignReadiness received:", { campaignId });
    try {
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.READINESS(campaignId)
        ),
        {
          method: "GET",
          jwt,
        }
      );

      if (!response.ok) {
        const authError = handleAuthError(response);
        if (authError) {
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: authError,
            data: { error: `HTTP ${response.status}` },
          };
        }
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to assess campaign readiness: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as any;
      return {
        code: AUTH_CODES.SUCCESS,
        message: `Campaign readiness assessment completed. Readiness score: ${result.readinessScore || "N/A"}`,
        data: result,
      };
    } catch (error) {
      console.error("Error assessing campaign readiness:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Failed to assess campaign readiness: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

// Tool to search campaign context for intelligent suggestions
const searchCampaignContext = tool({
  description:
    "Search through stored campaign context, character information, and campaign notes to find relevant information for intelligent suggestions",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign to search context for"),
    query: z
      .string()
      .describe("The search query to find relevant campaign context"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of results to return (default: 5)"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({
    campaignId,
    query,
    limit = 5,
    jwt,
  }): Promise<ToolResult> => {
    console.log("[Tool] searchCampaignContext received:", {
      campaignId,
      query,
      limit,
    });
    try {
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CONTEXT_SEARCH(campaignId)
        ),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            query,
            limit,
          }),
        }
      );

      if (!response.ok) {
        const authError = handleAuthError(response);
        if (authError) {
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: authError,
            data: { error: `HTTP ${response.status}` },
          };
        }
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to search campaign context: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as any;
      return {
        code: AUTH_CODES.SUCCESS,
        message: `Found ${result.results?.length || 0} relevant context entries for your query`,
        data: result,
      };
    } catch (error) {
      console.error("Error searching campaign context:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Failed to search campaign context: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

export const campaignContextTools = {
  storeCampaignContext,
  getCampaignContext,
  storeCharacterInfo,
  getIntelligentSuggestions,
  assessCampaignReadiness,
  searchCampaignContext,
};
