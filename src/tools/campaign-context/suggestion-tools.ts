import { tool } from "ai";
import { z } from "zod";
import {
  API_CONFIG,
  AUTH_CODES,
  MODEL_CONFIG,
  type ToolResult,
} from "../../app-constants";
import { authenticatedFetch, handleAuthError } from "../../lib/tool-auth";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  getEnvFromContext,
} from "../utils";
import { getAssessmentService } from "../../lib/service-factory";
import { CharacterEntitySyncService } from "../../services/campaign/character-entity-sync-service";
import { PlanningContextService } from "../../services/rag/planning-context-service";
import type { Env } from "../../middleware/auth";
import { getDAOFactory } from "../../dao/dao-factory";
import { EntityGraphService } from "../../services/graph/entity-graph-service";
import {
  CAMPAIGN_READINESS_ENTITY_TYPES,
  READINESS_ENTITY_BUCKETS,
  type StructuredEntityType,
  isValidEntityType,
} from "../../lib/entity-types";
import { createLLMProvider } from "../../services/llm/llm-provider-factory";
import { METADATA_ANALYSIS_PROMPTS } from "../../lib/prompts/metadata-analysis-prompts";

// Tool to get campaign suggestions
export const getCampaignSuggestions = tool({
  description:
    "Get intelligent suggestions for campaign development, session planning, and story progression. Suggestions should be informed by the Campaign Planning Checklist, prioritizing foundational elements (Campaign Foundation, World & Setting Basics, Starting Location) before later stages. CRITICAL: If you need suggestions for multiple types (e.g., world, session, plot), pass them as an array in a SINGLE call: suggestionType=['world', 'session', 'plot']. Do NOT make separate calls for each type. Call this tool only ONCE per user request, passing all needed suggestion types as an array. After calling this tool, you MUST immediately generate a text response to the user - do NOT make additional tool calls.",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    suggestionType: z
      .union([
        z.enum(["session", "character", "plot", "world", "combat"]),
        z.array(z.enum(["session", "character", "plot", "world", "combat"])),
      ])
      .optional()
      .describe(
        "Type(s) of suggestions to generate. Can be a single type (e.g., 'session') or an array of types (e.g., ['world', 'session', 'plot']). Default: ['session']. CRITICAL: If you need suggestions for multiple types, you MUST pass them as an array in a SINGLE call: suggestionType=['world', 'session', 'plot']. Do NOT make separate calls for each type. Making multiple calls will cause the agent to hit the step limit and fail to respond."
      ),
    context: z
      .string()
      .optional()
      .describe("Additional context for generating suggestions"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, suggestionType, context: _contextParam, jwt },
    context?: any
  ): Promise<ToolResult> => {
    // Normalize suggestionType to array - default to "session" if not provided
    const suggestionTypes = Array.isArray(suggestionType)
      ? suggestionType
      : [suggestionType || "session"];
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
        const campaignResult = await env
          .DB!.prepare("SELECT id FROM campaigns WHERE id = ? AND username = ?")
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

        // Use AssessmentService to get all characters (now only queries entities)
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

        // Generate suggestions for all requested types
        const allSuggestions: any[] = [];
        const suggestionsByType: Record<string, any[]> = {};

        for (const type of suggestionTypes) {
          const typeSuggestions = generateSuggestions(
            type,
            allCharacters,
            allResources,
            _contextParam
          );
          suggestionsByType[type] = typeSuggestions;
          allSuggestions.push(...typeSuggestions);
        }

        console.log(
          "[Tool] Generated suggestions:",
          allSuggestions.length,
          `across ${suggestionTypes.length} type(s)`
        );
        console.log(
          "[Tool] getCampaignSuggestions - Returning character count:",
          allCharacters.length
        );

        const responseMessage =
          suggestionTypes.length === 1
            ? `Generated ${allSuggestions.length} ${suggestionTypes[0]} suggestions`
            : `Generated ${allSuggestions.length} suggestions across ${suggestionTypes.length} types`;

        return createToolSuccess(
          responseMessage,
          {
            suggestionType:
              suggestionTypes.length === 1
                ? suggestionTypes[0]
                : suggestionTypes,
            suggestions: allSuggestions,
            suggestionsByType,
            totalCount: allSuggestions.length,
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
            suggestionType:
              suggestionTypes.length === 1
                ? suggestionTypes[0]
                : suggestionTypes,
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
        const campaignResult = await env
          .DB!.prepare("SELECT id FROM campaigns WHERE id = ? AND username = ?")
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

        // Use AssessmentService to get all characters (now only queries entities)
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

        // Retrieve campaign details to check metadata before semantic search
        const daoFactory = getDAOFactory(env);
        const campaign =
          await daoFactory.campaignDAO.getCampaignById(campaignId);

        // Perform semantic analysis of checklist coverage
        // Pass campaign metadata so it can check metadata fields before semantic search
        const semanticAnalysis = await performSemanticChecklistAnalysis(
          env as Env,
          campaignId,
          campaign?.name,
          campaign?.description || undefined,
          campaign?.metadata || null
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

interface EntityReadinessStats {
  entityTypeCounts: Record<string, number>;
  lowRelationshipEntities: {
    id: string;
    name: string;
    entityType: string;
    relationshipCount: number;
  }[];
}

interface SemanticChecklistAnalysis {
  coverage: Record<string, boolean>;
  entityStats?: EntityReadinessStats;
}

/**
 * Checklist items that are checked for campaign readiness.
 * These are used both for LLM metadata analysis and semantic search.
 */
const CHECKLIST_ITEMS = [
  {
    key: "campaign_tone",
    description:
      "overall campaign tone and mood for this game (for example lighthearted, grim, cozy, political, mythic, horror, epic), as implied by the campaign description, tags, GM notes, and the most prominent entities",
  },
  {
    key: "core_themes",
    description:
      "core themes and central ideas of the campaign (for example power, faith, legacy, corruption, found family, rebellion), as described in campaign notes, worldbuilding text, or recurring entities and factions",
  },
  {
    key: "world_name",
    description:
      "the proper-name of the campaign world or primary region (for example a world, continent, or plane name) mentioned in campaign description or setting notes",
  },
  {
    key: "cultural_trait",
    description:
      "dominant cultural traits or societal norms that define everyday life in the main region (attitudes, customs, taboos, social structures)",
  },
  {
    key: "magic_system",
    description:
      "how magic works in this setting, how common it is, and how people react to it, based on setting descriptions, notes, and rules variants",
  },
  {
    key: "starting_location",
    description:
      "the main starting town, city, or hub location for the campaign (its name and a short description of why people live there and what's notable about it)",
  },
  {
    key: "starting_npcs",
    description:
      "important NPCs present in the starting area (names, roles, goals, or fears) that the party is likely to meet early in the campaign",
  },
  {
    key: "factions",
    description:
      "factions or organizations with conflicting goals or agendas in the campaign world, including what they want and how they operate",
  },
  {
    key: "campaign_pitch",
    description:
      "a short 1–2 sentence campaign elevator pitch or summary that describes the premise, tone, and stakes of the campaign",
  },
] as const;

/**
 * Uses LLM to analyze campaign metadata and determine which checklist items are covered.
 * This allows flexible metadata structures without hardcoded field mappings.
 */
async function analyzeMetadataCoverage(
  env: Env,
  metadata: Record<string, unknown>,
  campaignDescription?: string
): Promise<Record<string, boolean>> {
  const coverage: Record<string, boolean> = {};

  // If no OpenAI API key, return empty coverage
  if (!env.OPENAI_API_KEY) {
    console.warn(
      "[MetadataAnalysis] No OpenAI API key available, skipping metadata analysis"
    );
    return coverage;
  }

  try {
    const coverageSchema = z.object({
      coverage: z
        .record(z.boolean())
        .describe(
          "Object mapping checklist item keys to boolean values indicating if they are covered by the metadata"
        ),
    });

    const prompt = METADATA_ANALYSIS_PROMPTS.formatMetadataAnalysisPrompt(
      CHECKLIST_ITEMS,
      metadata,
      campaignDescription
    );

    const llmProvider = createLLMProvider({
      provider: MODEL_CONFIG.PROVIDER.DEFAULT,
      apiKey: env.OPENAI_API_KEY,
      defaultModel: MODEL_CONFIG.OPENAI.METADATA_ANALYSIS,
      defaultTemperature: MODEL_CONFIG.PARAMETERS.METADATA_ANALYSIS_TEMPERATURE,
      defaultMaxTokens: MODEL_CONFIG.PARAMETERS.METADATA_ANALYSIS_MAX_TOKENS,
    });

    const result = await llmProvider.generateStructuredOutput<
      z.infer<typeof coverageSchema>
    >(prompt, {
      model: MODEL_CONFIG.OPENAI.METADATA_ANALYSIS,
      temperature: MODEL_CONFIG.PARAMETERS.METADATA_ANALYSIS_TEMPERATURE,
      maxTokens: MODEL_CONFIG.PARAMETERS.METADATA_ANALYSIS_MAX_TOKENS,
    });

    const validated = coverageSchema.parse(result);
    return validated.coverage;
  } catch (error) {
    console.warn(
      "[MetadataAnalysis] Failed to analyze metadata with LLM:",
      error instanceof Error ? error.message : String(error)
    );
    // Return empty coverage on error - semantic search will still work
    return coverage;
  }
}

/**
 * Performs semantic search to check for checklist coverage
 * Returns coverage booleans plus entity stats for richer readiness guidance
 */
async function performSemanticChecklistAnalysis(
  env: Env,
  campaignId: string,
  campaignName?: string,
  campaignDescription?: string,
  campaignMetadata?: string | null
): Promise<SemanticChecklistAnalysis> {
  const coverage: Record<string, boolean> = {};
  let entityStats: EntityReadinessStats | undefined;

  try {
    // Check campaign metadata first before semantic search
    // This prevents false recommendations for information that already exists in campaign fields

    // Parse campaign metadata
    let parsedMetadata: Record<string, unknown> = {};
    if (campaignMetadata) {
      try {
        parsedMetadata = JSON.parse(campaignMetadata) as Record<
          string,
          unknown
        >;
      } catch (error) {
        console.warn(
          "[SemanticAnalysis] Failed to parse campaign metadata:",
          error
        );
      }
    }

    // Use LLM to analyze metadata coverage if metadata exists
    if (Object.keys(parsedMetadata).length > 0 || campaignDescription) {
      const metadataCoverage = await analyzeMetadataCoverage(
        env,
        parsedMetadata,
        campaignDescription
      );
      // Merge LLM's metadata coverage into our coverage object
      Object.assign(coverage, metadataCoverage);
    }

    // Campaign pitch check: Description often serves as the campaign pitch
    // (This is now also handled by the LLM analysis, but we keep this as a fallback)
    if (campaignDescription && campaignDescription.trim().length > 50) {
      coverage.campaign_pitch = coverage.campaign_pitch || true;
    }

    if (!env.DB || !env.VECTORIZE || !env.OPENAI_API_KEY) {
      // Semantic search not available, return coverage from metadata only
      return { coverage, entityStats };
    }

    // 1) Check existing planning-context index for checklist coverage
    try {
      const planningService = new PlanningContextService(
        env.DB,
        env.VECTORIZE,
        env.OPENAI_API_KEY,
        env
      );

      // Use CHECKLIST_ITEMS for semantic search queries
      for (const { key, description: query } of CHECKLIST_ITEMS) {
        try {
          const results = await planningService.search({
            campaignId,
            query,
            limit: 3,
          });

          // Consider covered if we find at least one relevant result with good similarity
          // OR if already covered by metadata (metadata takes precedence)
          const semanticCoverage =
            results.length > 0 && results[0].similarityScore > 0.6;
          coverage[key] = coverage[key] || semanticCoverage;
        } catch (error) {
          console.warn(
            `[SemanticAnalysis] Failed to search planning context for ${key}:`,
            error
          );
          // Preserve existing coverage from metadata if available
          coverage[key] = coverage[key] ?? false;
        }
      }
    } catch (error) {
      console.warn(
        "[SemanticAnalysis] Failed to query planning context index:",
        error
      );
    }

    // 2) Also analyze entities + graph relationships for readiness guidance
    try {
      const daoFactory = getDAOFactory(env);
      const entityDAO = daoFactory.entityDAO;
      const graphService = new EntityGraphService(entityDAO);

      const allEntities = await entityDAO.listEntitiesByCampaign(campaignId);

      const entityTypeCounts: Record<string, number> = {};
      for (const entity of allEntities) {
        const type = entity.entityType || "unknown";
        // Only count known structured entity types; this keeps stats aligned with
        // our canonical ENTITY_TYPE registry while still allowing new types to be added there.
        if (!isValidEntityType(type)) continue;
        entityTypeCounts[type] = (entityTypeCounts[type] || 0) + 1;
      }

      // Treat conversational theme_preference entities as covering tone + core themes
      for (const entity of allEntities) {
        if (entity.entityType !== "conversational_context") continue;
        const metadata = (entity.metadata || {}) as Record<string, unknown>;
        const noteType = (metadata.noteType as string) || "";
        if (noteType === "theme_preference") {
          coverage.campaign_tone = true;
          coverage.core_themes = true;
        }
      }

      // Identify entities with very few relationships (< 3) for follow-up guidance
      const lowRelationshipEntities: EntityReadinessStats["lowRelationshipEntities"] =
        [];

      const interestingTypes = new Set<StructuredEntityType>(
        CAMPAIGN_READINESS_ENTITY_TYPES
      );

      for (const entity of allEntities) {
        const rawType = entity.entityType || "unknown";
        if (!isValidEntityType(rawType)) continue;
        if (!interestingTypes.has(rawType)) continue;

        let relationshipCount = 0;
        try {
          const relationships = await graphService.getRelationshipsForEntity(
            campaignId,
            entity.id
          );
          relationshipCount = relationships.length;
        } catch (error) {
          console.warn(
            `[SemanticAnalysis] Failed to load relationships for entity ${entity.id}:`,
            error
          );
        }

        if (relationshipCount < 3) {
          lowRelationshipEntities.push({
            id: entity.id,
            name: entity.name,
            entityType: entity.entityType,
            relationshipCount,
          });
        }
      }

      // Sort by relationship count (fewest first) and cap for safety
      lowRelationshipEntities.sort(
        (a, b) => a.relationshipCount - b.relationshipCount
      );

      entityStats = {
        entityTypeCounts,
        lowRelationshipEntities: lowRelationshipEntities.slice(0, 50),
      };
    } catch (error) {
      console.warn(
        "[SemanticAnalysis] Failed to analyze entities/graph for readiness:",
        error
      );
    }
  } catch (error) {
    console.warn(
      "[SemanticAnalysis] Failed to perform semantic analysis:",
      error
    );
    // If semantic search fails, we'll just return empty coverage/stats
  }

  return { coverage, entityStats };
}

// Helper function to perform readiness assessment
function performReadinessAssessment(
  type: string,
  characters: any[],
  resources: any[],
  context: any[],
  semanticAnalysis?: SemanticChecklistAnalysis
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

  const coverage = semanticAnalysis?.coverage;
  const entityStats = semanticAnalysis?.entityStats;

  // Generate recommendations based on semantic analysis if available
  if (coverage) {
    if (!coverage.campaign_tone) {
      recommendations.push(
        "Define campaign tone (heroic, grim, cozy, etc.) - You can chat with me about this or upload files containing tone descriptions"
      );
    }
    if (!coverage.core_themes) {
      recommendations.push(
        "Define core themes for your campaign - You can discuss themes with me or upload documents that describe your campaign themes"
      );
    }
    if (!coverage.world_name) {
      recommendations.push(
        "Name your campaign world or region - You can tell me the name or upload files that mention the world name"
      );
    }
    if (!coverage.starting_location) {
      recommendations.push(
        "Establish your starting location - You can describe it in chat or upload location descriptions from your notes"
      );
    }
    if (!coverage.factions) {
      recommendations.push(
        "Define factions or organizations in your world - You can discuss them with me or upload documents describing your factions"
      );
    }

    // Additional guidance based on entity coverage/stats
    if (entityStats) {
      const counts = entityStats.entityTypeCounts;

      const sumBucket = (bucket: StructuredEntityType[]) =>
        bucket.reduce((sum, type) => sum + (counts[type] || 0), 0);

      const npcCount = sumBucket(READINESS_ENTITY_BUCKETS.npcLike);
      if (npcCount < 3) {
        recommendations.push(
          "Create 3–5 named NPCs tied to your starting location (allies, patrons, troublemakers)."
        );
      }

      const factionCount = sumBucket(READINESS_ENTITY_BUCKETS.factionLike);
      if (factionCount < 2) {
        recommendations.push(
          "Define at least two factions with conflicting goals to drive tension in your campaign."
        );
      }

      const locationCount = sumBucket(READINESS_ENTITY_BUCKETS.locationLike);
      if (locationCount === 0) {
        recommendations.push(
          "Establish your starting town or hub area with a few key locations players can visit."
        );
      }

      const hookCount = sumBucket(READINESS_ENTITY_BUCKETS.hookLike);
      if (hookCount === 0) {
        recommendations.push(
          "Create 2–3 concrete adventure hooks or quests the party can pursue next."
        );
      }

      const lowRel = entityStats.lowRelationshipEntities;
      if (lowRel && lowRel.length > 0) {
        const names = lowRel
          .slice(0, 3)
          .map((e) => e.name)
          .filter(Boolean);

        if (names.length > 0) {
          recommendations.push(
            `Deepen your world by adding relationships for key entities like ${names.join(
              ", "
            )} (aim for at least 3 connections each to NPCs, locations, and factions).`
          );
        } else {
          recommendations.push(
            "Many entities in your world only connect to 0–2 others. Add more relationships between NPCs, factions, and locations to make the world feel interconnected."
          );
        }
      }
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
