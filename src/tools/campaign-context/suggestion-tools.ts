import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, AUTH_CODES, type ToolResult } from "../../app-constants";
import { authenticatedFetch, handleAuthError } from "../../lib/tool-auth";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
} from "../utils";
import { getAssessmentService } from "../../lib/service-factory";
import { CharacterEntitySyncService } from "../../services/campaign/character-entity-sync-service";
import { PlanningContextService } from "../../services/rag/planning-context-service";
import type { Env } from "../../middleware/auth";

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

// Tool to get campaign suggestions
export const getCampaignSuggestions = tool({
  description:
    "Get intelligent suggestions for campaign development, session planning, and story progression. Suggestions should be informed by the Campaign Planning Checklist, prioritizing foundational elements (Campaign Foundation, World & Setting Basics, Starting Location) before later stages.",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    suggestionType: z
      .enum(["session", "character", "plot", "world", "combat"])
      .optional()
      .describe("Type of suggestions to generate (default: session)"),
    context: z
      .string()
      .optional()
      .describe("Additional context for generating suggestions"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, suggestionType = "session", context: _contextParam, jwt },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[getCampaignSuggestions] Using toolCallId:", toolCallId);

    console.log("[Tool] getCampaignSuggestions received:", {
      campaignId,
      suggestionType,
      context,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] getCampaignSuggestions - Environment found:", !!env);
      console.log("[Tool] getCampaignSuggestions - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log(
          "[Tool] getCampaignSuggestions - User ID extracted:",
          userId
        );

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            AUTH_CODES.INVALID_KEY,
            toolCallId
          );
        }

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return createToolError(
            "Campaign not found",
            "Campaign not found",
            404,
            toolCallId
          );
        }

        // Sync character_backstory entries to entities before getting characters
        try {
          const syncService = new CharacterEntitySyncService(env as Env);
          await syncService.syncAllCharacterBackstories(campaignId);
        } catch (syncError) {
          console.error(
            "[Tool] getCampaignSuggestions - Failed to sync character_backstory entries:",
            syncError
          );
          // Don't fail suggestions if sync fails
        }

        // Use AssessmentService to get all characters (includes campaign_characters, entities, and character_backstory)
        const assessmentService = getAssessmentService(env as Env);
        const allCharacters =
          await assessmentService.getCampaignCharacters(campaignId);
        const allResources =
          await assessmentService.getCampaignResources(campaignId);

        console.log("[Tool] getCampaignSuggestions - Retrieved characters:", {
          total: allCharacters.length,
          fromCampaignCharacters: allCharacters.filter(
            (c: any) => c.id && !c.entity_type && !c.context_type
          ).length,
          fromEntities: allCharacters.filter((c: any) => c.entity_type).length,
          fromContext: allCharacters.filter(
            (c: any) => c.context_type === "character_backstory"
          ).length,
        });

        // Generate suggestions based on type and available data
        const suggestions = generateSuggestions(
          suggestionType,
          allCharacters,
          allResources,
          _contextParam
        );

        console.log("[Tool] Generated suggestions:", suggestions.length);
        console.log(
          "[Tool] getCampaignSuggestions - Returning character count:",
          allCharacters.length
        );

        return createToolSuccess(
          `Generated ${suggestions.length} ${suggestionType} suggestions`,
          {
            suggestionType,
            suggestions,
            totalCount: suggestions.length,
            context: {
              characters: allCharacters.length,
              resources: allResources.length,
            },
            details: {
              characterCount: allCharacters.length,
              resourceCount: allResources.length,
            },
          },
          toolCallId
        );
      }

      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.SUGGESTIONS(campaignId)
        ),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            suggestionType,
            context,
          }),
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(
            authError,
            null,
            AUTH_CODES.INVALID_KEY,
            toolCallId
          );
        }
        return createToolError(
          "Failed to get campaign suggestions",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = (await response.json()) as any;
      return createToolSuccess(
        `Generated ${result.suggestions?.length || 0} ${suggestionType} suggestions`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error getting campaign suggestions:", error);
      return createToolError(
        "Failed to get campaign suggestions",
        error,
        500,
        toolCallId
      );
    }
  },
});

// Tool to assess campaign readiness
export const assessCampaignReadiness = tool({
  description:
    "Assess the campaign's readiness for the next session and provide recommendations. When interpreting results, reference the Campaign Planning Checklist to provide structured, prioritized recommendations based on logical dependencies (foundational elements before later stages).",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    assessmentType: z
      .enum(["session", "story", "characters", "world"])
      .optional()
      .describe("Type of readiness assessment (default: session)"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, assessmentType = "session", jwt },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[assessCampaignReadiness] Using toolCallId:", toolCallId);

    console.log("[Tool] assessCampaignReadiness received:", {
      campaignId,
      assessmentType,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] assessCampaignReadiness - Environment found:", !!env);
      console.log("[Tool] assessCampaignReadiness - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log(
          "[Tool] assessCampaignReadiness - User ID extracted:",
          userId
        );

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            AUTH_CODES.INVALID_KEY,
            toolCallId
          );
        }

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return createToolError(
            "Campaign not found",
            "Campaign not found",
            404,
            toolCallId
          );
        }

        // Sync character_backstory entries to entities before assessment
        try {
          const syncService = new CharacterEntitySyncService(env as Env);
          await syncService.syncAllCharacterBackstories(campaignId);
          console.log("[Tool] Synced character_backstory entries to entities");
        } catch (syncError) {
          console.error(
            "[Tool] Failed to sync character_backstory entries:",
            syncError
          );
          // Don't fail assessment if sync fails
        }

        // Use AssessmentService to get all characters (includes campaign_characters, entities, and character_backstory)
        const assessmentService = getAssessmentService(env as Env);
        const allCharacters =
          await assessmentService.getCampaignCharacters(campaignId);
        const allContext =
          await assessmentService.getCampaignContext(campaignId);
        const allResources =
          await assessmentService.getCampaignResources(campaignId);

        console.log("[Tool] Character counts:", {
          totalCharacters: allCharacters.length,
          campaignCharacters: allCharacters.filter(
            (c: any) => c.id && !c.entity_type && !c.context_type
          ).length,
          entityCharacters: allCharacters.filter((c: any) => c.entity_type)
            .length,
          contextCharacters: allCharacters.filter(
            (c: any) => c.context_type === "character_backstory"
          ).length,
        });

        // Perform semantic analysis of checklist coverage
        const semanticAnalysis = await performSemanticChecklistAnalysis(
          env as Env,
          campaignId
        );

        // Perform assessment with semantic analysis results
        const assessment = performReadinessAssessment(
          assessmentType,
          allCharacters,
          allResources,
          allContext,
          semanticAnalysis
        );

        console.log("[Tool] Assessment completed:", assessment.score);

        return createToolSuccess(
          `Campaign readiness assessment completed`,
          {
            assessmentType,
            campaignState: assessment.campaignState,
            recommendations: assessment.recommendations,
            details: assessment.details,
          },
          toolCallId
        );
      }

      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.READINESS(campaignId)
        ),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            assessmentType,
          }),
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(
            authError,
            null,
            AUTH_CODES.INVALID_KEY,
            toolCallId
          );
        }
        return createToolError(
          "Failed to assess campaign readiness",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = (await response.json()) as any;
      return createToolSuccess(
        `Campaign readiness assessment completed`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error assessing campaign readiness:", error);
      return createToolError(
        "Failed to assess campaign readiness",
        error,
        500,
        toolCallId
      );
    }
  },
});

// Helper function to generate suggestions
function generateSuggestions(
  type: string,
  _characters: any[],
  _resources: any[],
  _context?: string
): any[] {
  const suggestions = [];

  switch (type) {
    case "session":
      suggestions.push(
        {
          title: "Plan a Combat Encounter",
          description:
            "Design an engaging combat scenario based on your party composition",
          priority: "high",
          estimatedTime: "30 minutes",
        },
        {
          title: "Create Social Interaction",
          description: "Develop NPC interactions and dialogue opportunities",
          priority: "medium",
          estimatedTime: "20 minutes",
        }
      );
      break;
    case "character":
      suggestions.push({
        title: "Character Development Arc",
        description: "Plan character growth and story progression",
        priority: "high",
        estimatedTime: "25 minutes",
      });
      break;
    case "plot":
      suggestions.push({
        title: "Main Story Advancement",
        description: "Move the main plot forward with key story beats",
        priority: "high",
        estimatedTime: "40 minutes",
      });
      break;
    default:
      suggestions.push({
        title: "General Session Planning",
        description:
          "Prepare a well-rounded session with multiple encounter types",
        priority: "medium",
        estimatedTime: "45 minutes",
      });
  }

  return suggestions;
}

/**
 * Performs semantic search to check for checklist coverage
 * Returns an object indicating which checklist items appear to be covered
 */
async function performSemanticChecklistAnalysis(
  env: Env,
  campaignId: string
): Promise<Record<string, boolean>> {
  const coverage: Record<string, boolean> = {};

  try {
    if (!env.DB || !env.VECTORIZE || !env.OPENAI_API_KEY) {
      // Semantic search not available, return empty coverage
      return {};
    }

    const planningService = new PlanningContextService(
      env.DB,
      env.VECTORIZE,
      env.OPENAI_API_KEY,
      env
    );

    // Key checklist items to check for
    const checklistQueries = [
      {
        key: "campaign_tone",
        query: "campaign tone mood heroic grim cozy political",
      },
      {
        key: "core_themes",
        query: "core themes power faith legacy corruption",
      },
      { key: "world_name", query: "world name region setting location" },
      {
        key: "cultural_trait",
        query: "cultural trait dominant culture society",
      },
      { key: "magic_system", query: "magic system common magic people react" },
      {
        key: "starting_location",
        query: "starting town city location hub area",
      },
      {
        key: "starting_npcs",
        query: "NPCs non-player characters starting location",
      },
      {
        key: "factions",
        query: "factions organizations groups conflicting goals",
      },
      {
        key: "campaign_pitch",
        query: "campaign elevator pitch summary description",
      },
    ];

    // Search for each checklist item
    for (const { key, query } of checklistQueries) {
      try {
        const results = await planningService.search({
          campaignId,
          query,
          limit: 3,
        });

        // Consider covered if we find at least one relevant result with good similarity
        coverage[key] = results.length > 0 && results[0].similarityScore > 0.6;
      } catch (error) {
        console.warn(`[SemanticAnalysis] Failed to search for ${key}:`, error);
        coverage[key] = false;
      }
    }
  } catch (error) {
    console.warn(
      "[SemanticAnalysis] Failed to perform semantic analysis:",
      error
    );
    // If semantic search fails, we'll just return empty coverage
  }

  return coverage;
}

// Helper function to perform readiness assessment
function performReadinessAssessment(
  type: string,
  characters: any[],
  resources: any[],
  context: any[],
  semanticAnalysis?: Record<string, boolean>
): any {
  let score = 0;
  const recommendations = [];

  // Basic scoring based on available data
  if (characters.length > 0) score += 20;
  if (resources.length > 0) score += 20;
  if (context.length > 0) score += 20;

  // Type-specific scoring
  switch (type) {
    case "session":
      if (characters.length >= 3) score += 20;
      if (resources.length >= 2) score += 20;
      break;
    case "story":
      if (context.length >= 3) score += 30;
      if (characters.length >= 2) score += 20;
      break;
    case "characters":
      if (characters.length >= 2) score += 40;
      break;
    case "world":
      if (context.length >= 5) score += 40;
      break;
  }

  // Cap score at 100
  score = Math.min(score, 100);

  // Generate recommendations based on semantic analysis if available
  if (semanticAnalysis) {
    if (!semanticAnalysis.campaign_tone) {
      recommendations.push("Define campaign tone (heroic, grim, cozy, etc.)");
    }
    if (!semanticAnalysis.core_themes) {
      recommendations.push("Define core themes for your campaign");
    }
    if (!semanticAnalysis.world_name) {
      recommendations.push("Name your campaign world or region");
    }
    if (!semanticAnalysis.starting_location) {
      recommendations.push("Establish your starting location");
    }
    if (!semanticAnalysis.factions) {
      recommendations.push("Define factions or organizations in your world");
    }
  } else {
    // Fallback to count-based recommendations if semantic analysis unavailable
    if (score < 50) {
      recommendations.push("Add more campaign context and resources");
    }
    if (characters.length < 2) {
      recommendations.push("Create more character profiles");
    }
    if (resources.length < 2) {
      recommendations.push("Add more campaign resources");
    }
  }

  // Convert score to descriptive state
  const getCampaignState = (score: number): string => {
    if (score >= 90) return "Legendary";
    else if (score >= 80) return "Epic-Ready";
    else if (score >= 70) return "Well-Traveled";
    else if (score >= 60) return "Flourishing";
    else if (score >= 50) return "Growing Strong";
    else if (score >= 40) return "Taking Shape";
    else if (score >= 30) return "Taking Root";
    else if (score >= 20) return "Newly Forged";
    else return "Fresh Start";
  };

  return {
    campaignState: getCampaignState(score),
    recommendations,
    details: {
      characters: characters.length,
      resources: resources.length,
      context: context.length,
      semanticCoverage: semanticAnalysis || {},
    },
  };
}
