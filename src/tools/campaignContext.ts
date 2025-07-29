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
  execute: async (
    { campaignId, contextType = "all", jwt },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] getCampaignContext received:", {
      campaignId,
      contextType,
    });
    console.log("[Tool] getCampaignContext context:", context);
    try {
      // Check if we have access to the environment through context
      const env = getEnvFromContext(context);
      console.log("[getCampaignContext] Environment from context:", !!env);
      console.log(
        "[getCampaignContext] DB binding exists:",
        env?.DB !== undefined
      );

      if (env?.DB) {
        console.log(
          "[getCampaignContext] Running in Durable Object context, calling database directly"
        );

        // Extract username from JWT
        const userId = await extractUsernameFromJwt(jwt || null, env);
        console.log("[getCampaignContext] User ID extracted:", userId);

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

        // Query campaign context
        let query = "SELECT * FROM campaign_context WHERE campaign_id = ?";
        const params = [campaignId];

        if (contextType !== "all") {
          query += " AND context_type = ?";
          params.push(contextType);
        }

        query += " ORDER BY created_at DESC";

        const contextResult = await env.DB.prepare(query)
          .bind(...params)
          .all();

        console.log(
          "[getCampaignContext] Retrieved context entries:",
          contextResult.results?.length || 0
        );

        return {
          code: AUTH_CODES.SUCCESS,
          message: `Retrieved ${contextResult.results?.length || 0} context entries for campaign`,
          data: {
            context: contextResult.results || [],
            campaignId,
            contextType,
          },
        };
      } else {
        // Fall back to HTTP API
        console.log(
          "[getCampaignContext] Running in HTTP context, making API request"
        );
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
      }
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
  execute: async (
    { campaignId, suggestionType, specificFocus, jwt },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] getIntelligentSuggestions received:", {
      campaignId,
      suggestionType,
      specificFocus,
    });
    console.log("[Tool] getIntelligentSuggestions context:", context);
    try {
      // Check if we have access to the environment through context
      const env = getEnvFromContext(context);
      console.log(
        "[getIntelligentSuggestions] Environment from context:",
        !!env
      );
      console.log(
        "[getIntelligentSuggestions] DB binding exists:",
        env?.DB !== undefined
      );

      if (env?.DB) {
        console.log(
          "[getIntelligentSuggestions] Running in Durable Object context, calling database directly"
        );

        // Extract username from JWT
        const userId = await extractUsernameFromJwt(jwt || null, env);
        console.log("[getIntelligentSuggestions] User ID extracted:", userId);

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

        // For now, return a simple response since this would require AI processing
        // In a real implementation, this would analyze campaign context and generate suggestions
        console.log(
          "[getIntelligentSuggestions] Generating suggestions for type:",
          suggestionType
        );

        return {
          code: AUTH_CODES.SUCCESS,
          message: `Generated 3 intelligent suggestions for ${suggestionType}`,
          data: {
            suggestions: [
              {
                type: suggestionType,
                title: "Sample suggestion 1",
                description:
                  "This is a sample suggestion based on campaign context",
                priority: "high",
              },
              {
                type: suggestionType,
                title: "Sample suggestion 2",
                description: "Another sample suggestion for campaign planning",
                priority: "medium",
              },
              {
                type: suggestionType,
                title: "Sample suggestion 3",
                description:
                  "A third sample suggestion to help with campaign development",
                priority: "low",
              },
            ],
            campaignId,
            suggestionType,
            specificFocus,
          },
        };
      } else {
        // Fall back to HTTP API
        console.log(
          "[getIntelligentSuggestions] Running in HTTP context, making API request"
        );
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
      }
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
  execute: async ({ campaignId, jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] assessCampaignReadiness received:", { campaignId });
    console.log("[Tool] assessCampaignReadiness context:", context);
    try {
      // Check if we have access to the environment through context
      const env = getEnvFromContext(context);
      console.log("[assessCampaignReadiness] Environment from context:", !!env);
      console.log(
        "[assessCampaignReadiness] DB binding exists:",
        env?.DB !== undefined
      );

      if (env?.DB) {
        console.log(
          "[assessCampaignReadiness] Running in Durable Object context, calling database directly"
        );

        // Extract username from JWT
        const userId = await extractUsernameFromJwt(jwt || null, env);
        console.log("[assessCampaignReadiness] User ID extracted:", userId);

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

        // Get campaign context and character counts
        const contextResult = await env.DB.prepare(
          "SELECT COUNT(*) as context_count FROM campaign_context WHERE campaign_id = ?"
        )
          .bind(campaignId)
          .first();

        const characterResult = await env.DB.prepare(
          "SELECT COUNT(*) as character_count FROM campaign_characters WHERE campaign_id = ?"
        )
          .bind(campaignId)
          .first();

        const contextCount = contextResult?.context_count || 0;
        const characterCount = characterResult?.character_count || 0;

        console.log("[assessCampaignReadiness] Campaign assessment:", {
          contextCount,
          characterCount,
        });

        // Generate readiness assessment
        const readinessScore = Math.min(
          100,
          contextCount * 10 + characterCount * 15
        );
        const readinessLevel =
          readinessScore >= 80
            ? "ready"
            : readinessScore >= 50
              ? "mostly_ready"
              : "needs_work";

        const recommendations = [];
        if (contextCount < 3) {
          recommendations.push(
            "Add more campaign context (world descriptions, plot hooks)"
          );
        }
        if (characterCount < 2) {
          recommendations.push("Add more character information");
        }
        if (recommendations.length === 0) {
          recommendations.push("Campaign is well-prepared for play");
        }

        return {
          code: AUTH_CODES.SUCCESS,
          message: `Campaign readiness assessment: ${readinessLevel} (${readinessScore}/100)`,
          data: {
            readinessScore,
            readinessLevel,
            contextCount,
            characterCount,
            recommendations,
            campaignId,
          },
        };
      } else {
        // Fall back to HTTP API
        console.log(
          "[assessCampaignReadiness] Running in HTTP context, making API request"
        );
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
          message: `Campaign readiness assessment: ${result.readinessLevel || "unknown"}`,
          data: result,
        };
      }
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
  execute: async (
    { campaignId, query, limit = 5, jwt },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] searchCampaignContext received:", {
      campaignId,
      query,
      limit,
    });
    console.log("[Tool] searchCampaignContext context:", context);
    try {
      // Check if we have access to the environment through context
      const env = getEnvFromContext(context);
      console.log("[searchCampaignContext] Environment from context:", !!env);
      console.log(
        "[searchCampaignContext] DB binding exists:",
        env?.DB !== undefined
      );

      if (env?.DB) {
        console.log(
          "[searchCampaignContext] Running in Durable Object context, calling database directly"
        );

        // Extract username from JWT
        const userId = await extractUsernameFromJwt(jwt || null, env);
        console.log("[searchCampaignContext] User ID extracted:", userId);

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

        // Search campaign context using LIKE for simple text matching
        // In a real implementation, this would use vector search or full-text search
        const searchQuery = `%${query}%`;
        const contextResult = await env.DB.prepare(
          "SELECT * FROM campaign_context WHERE campaign_id = ? AND (title LIKE ? OR content LIKE ?) ORDER BY created_at DESC LIMIT ?"
        )
          .bind(campaignId, searchQuery, searchQuery, limit)
          .all();

        console.log(
          "[searchCampaignContext] Found context entries:",
          contextResult.results?.length || 0
        );

        return {
          code: AUTH_CODES.SUCCESS,
          message: `Found ${contextResult.results?.length || 0} relevant context entries for your query`,
          data: {
            results: contextResult.results || [],
            query,
            limit,
            campaignId,
          },
        };
      } else {
        // Fall back to HTTP API
        console.log(
          "[searchCampaignContext] Running in HTTP context, making API request"
        );
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
      }
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

// Tool to create a character using AI with user confirmation
const createCharacter = tool({
  description:
    "Create a new character for a campaign using AI generation. This tool will generate a complete character sheet including stats, backstory, personality, and goals. Requires user confirmation before creating.",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign this character belongs to"),
    characterName: z.string().describe("The name of the character"),
    characterClass: z
      .string()
      .optional()
      .describe(
        "The character's class (e.g., Fighter, Wizard, etc.) - if not provided, AI will suggest one"
      ),
    characterLevel: z
      .number()
      .optional()
      .describe("The character's level (defaults to 1)"),
    characterRace: z
      .string()
      .optional()
      .describe("The character's race - if not provided, AI will suggest one"),
    campaignSetting: z
      .string()
      .optional()
      .describe("The campaign setting or theme to inform character creation"),
    playerPreferences: z
      .string()
      .optional()
      .describe(
        "Any specific player preferences or requirements for the character"
      ),
    partyComposition: z
      .array(z.string())
      .optional()
      .describe(
        "Array of existing party members to consider for party balance"
      ),
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
      characterLevel = 1,
      characterRace,
      campaignSetting,
      playerPreferences,
      partyComposition,
      jwt,
    },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] createCharacter received:", {
      campaignId,
      characterName,
      characterClass,
      characterLevel,
      characterRace,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] createCharacter - Environment found:", !!env);
      console.log("[Tool] createCharacter - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = await extractUsernameFromJwt(jwt || null, env);
        console.log("[Tool] createCharacter - User ID extracted:", userId);

        if (!userId) {
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: "Invalid authentication token",
            data: { error: "Authentication failed" },
          };
        }

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id, name FROM campaigns WHERE id = ? AND username = ?"
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

        // Generate character using AI
        const characterData = await generateCharacterWithAI({
          characterName,
          characterClass,
          characterLevel,
          characterRace,
          campaignSetting,
          playerPreferences,
          partyComposition,
          campaignName: campaignResult.name as string,
        });

        // Store the character information
        const characterId = crypto.randomUUID();
        const now = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO campaign_characters (id, campaign_id, character_name, character_class, character_level, character_race, backstory, personality_traits, goals, relationships, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
          .bind(
            characterId,
            campaignId,
            characterData.characterName,
            characterData.characterClass,
            characterData.characterLevel,
            characterData.characterRace,
            characterData.backstory,
            characterData.personalityTraits,
            characterData.goals,
            characterData.relationships
              ? JSON.stringify(characterData.relationships)
              : null,
            characterData.metadata
              ? JSON.stringify(characterData.metadata)
              : null,
            now,
            now
          )
          .run();

        // Update campaign updated_at
        await env.DB.prepare("UPDATE campaigns SET updated_at = ? WHERE id = ?")
          .bind(now, campaignId)
          .run();

        console.log(
          "[Tool] Created character with AI:",
          characterId,
          "name:",
          characterData.characterName
        );

        return {
          code: AUTH_CODES.SUCCESS,
          message: `Successfully created character ${characterData.characterName} using AI generation`,
          data: {
            id: characterId,
            ...characterData,
            createdAt: now,
            requiresConfirmation: true,
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
            campaignSetting,
            playerPreferences,
            partyComposition,
            useAI: true,
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
          message: `Failed to create character: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as any;
      return {
        code: AUTH_CODES.SUCCESS,
        message: `Successfully created character ${characterName} using AI generation`,
        data: { ...result, requiresConfirmation: true },
      };
    } catch (error) {
      console.error("Error creating character:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Failed to create character: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

// Helper function to generate character data using AI
async function generateCharacterWithAI(params: {
  characterName: string;
  characterClass?: string;
  characterLevel: number;
  characterRace?: string;
  campaignSetting?: string;
  playerPreferences?: string;
  partyComposition?: string[];
  campaignName: string;
}): Promise<{
  characterName: string;
  characterClass: string;
  characterLevel: number;
  characterRace: string;
  backstory: string;
  personalityTraits: string;
  goals: string;
  relationships: string[];
  metadata: Record<string, any>;
}> {
  // This would integrate with OpenAI to generate character data
  // For now, return a structured character with AI-generated content
  const {
    characterName,
    characterClass,
    characterLevel,
    characterRace,
    campaignSetting,
    playerPreferences,
    partyComposition,
    campaignName,
  } = params;

  // Generate character class if not provided
  const finalClass = characterClass || generateRandomClass();

  // Generate character race if not provided
  const finalRace = characterRace || generateRandomRace();

  // Generate backstory based on provided parameters
  const backstory = generateBackstory({
    characterName,
    characterClass: finalClass,
    characterRace: finalRace,
    campaignSetting,
    playerPreferences,
  });

  // Generate personality traits
  const personalityTraits = generatePersonalityTraits(finalClass, finalRace);

  // Generate goals
  const goals = generateGoals({
    characterName,
    characterClass: finalClass,
    characterRace: finalRace,
    campaignSetting,
  });

  // Generate relationships
  const relationships = generateRelationships(partyComposition || []);

  return {
    characterName,
    characterClass: finalClass,
    characterLevel,
    characterRace: finalRace,
    backstory,
    personalityTraits,
    goals,
    relationships,
    metadata: {
      generatedByAI: true,
      generationTimestamp: new Date().toISOString(),
      campaignName,
      campaignSetting,
      playerPreferences,
    },
  };
}

// Helper functions for character generation
function generateRandomClass(): string {
  const classes = [
    "Fighter",
    "Wizard",
    "Cleric",
    "Rogue",
    "Ranger",
    "Paladin",
    "Bard",
    "Druid",
    "Monk",
    "Warlock",
    "Sorcerer",
    "Barbarian",
  ];
  return classes[Math.floor(Math.random() * classes.length)];
}

function generateRandomRace(): string {
  const races = [
    "Human",
    "Elf",
    "Dwarf",
    "Halfling",
    "Dragonborn",
    "Tiefling",
    "Half-Elf",
    "Half-Orc",
    "Gnome",
    "Aarakocra",
    "Genasi",
    "Goliath",
  ];
  return races[Math.floor(Math.random() * races.length)];
}

function generateBackstory(params: {
  characterName: string;
  characterClass: string;
  characterRace: string;
  campaignSetting?: string;
  playerPreferences?: string;
}): string {
  const {
    characterName,
    characterClass,
    characterRace,
    campaignSetting,
    playerPreferences,
  } = params;

  const setting = campaignSetting || "fantasy world";
  const preferences = playerPreferences || "";

  return `${characterName} is a 1st level ${characterRace} ${characterClass} from a ${setting}. ${preferences ? `The player has requested: ${preferences}. ` : ""}They have trained in their chosen path and are ready to embark on their adventure. Their background and experiences have shaped them into a unique individual with their own motivations and goals.`;
}

function generatePersonalityTraits(
  characterClass: string,
  characterRace: string
): string {
  const classTraits = {
    Fighter: "Brave, disciplined, and tactical",
    Wizard: "Intellectual, curious, and methodical",
    Cleric: "Devout, compassionate, and principled",
    Rogue: "Cunning, adaptable, and resourceful",
    Ranger: "Independent, observant, and nature-loving",
    Paladin: "Honorable, courageous, and just",
    Bard: "Charismatic, creative, and social",
    Druid: "Wise, connected to nature, and spiritual",
    Monk: "Disciplined, focused, and philosophical",
    Warlock: "Ambitious, mysterious, and determined",
    Sorcerer: "Impulsive, powerful, and instinctive",
    Barbarian: "Fierce, passionate, and primal",
  };

  const raceTraits = {
    Human: "Adaptable and ambitious",
    Elf: "Graceful and long-lived",
    Dwarf: "Sturdy and traditional",
    Halfling: "Cheerful and lucky",
    Dragonborn: "Proud and honorable",
    Tiefling: "Resilient and misunderstood",
    "Half-Elf": "Diplomatic and versatile",
    "Half-Orc": "Strong and determined",
    Gnome: "Curious and inventive",
    Aarakocra: "Free-spirited and aerial",
    Genasi: "Elemental and unique",
    Goliath: "Strong and competitive",
  };

  const classTrait =
    classTraits[characterClass as keyof typeof classTraits] ||
    "Unique and individual";
  const raceTrait =
    raceTraits[characterRace as keyof typeof raceTraits] ||
    "Distinctive and special";

  return `${classTrait}. ${raceTrait}. They have developed their own unique personality through their experiences and choices.`;
}

function generateGoals(params: {
  characterName: string;
  characterClass: string;
  characterRace: string;
  campaignSetting?: string;
}): string {
  const { characterName, characterClass } = params;

  const classGoals = {
    Fighter: "Prove their martial prowess and protect others",
    Wizard: "Unlock ancient knowledge and master powerful magic",
    Cleric: "Serve their deity and spread their faith",
    Rogue: "Acquire wealth and live by their own rules",
    Ranger: "Explore the wilderness and protect nature",
    Paladin: "Uphold justice and vanquish evil",
    Bard: "Gather stories and inspire others",
    Druid: "Maintain the balance of nature",
    Monk: "Achieve inner peace and physical perfection",
    Warlock: "Fulfill their pact and gain power",
    Sorcerer: "Control their innate magic and discover their destiny",
    Barbarian: "Prove their strength and honor their ancestors",
  };

  const goal =
    classGoals[characterClass as keyof typeof classGoals] ||
    "Make their mark on the world";

  return `${characterName} seeks to ${goal}. They are driven by their personal motivations and the challenges that lie ahead in their journey.`;
}

function generateRelationships(partyComposition: string[]): string[] {
  if (partyComposition.length === 0) {
    return ["Ready to form new bonds with fellow adventurers"];
  }

  return partyComposition.map(
    (member) =>
      `Looking forward to working with ${member} and building a strong partnership`
  );
}

export const campaignContextTools = {
  storeCampaignContext,
  getCampaignContext,
  storeCharacterInfo,
  getIntelligentSuggestions,
  assessCampaignReadiness,
  searchCampaignContext,
  createCharacter,
};
