import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "@/app-constants";
import { authenticatedFetch, handleAuthError } from "@/lib/tool-auth";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
} from "../utils";
import { getDAOFactory } from "@/dao/dao-factory";
import { PlanningContextService } from "@/services/rag/planning-context-service";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { EntityImportanceService } from "@/services/graph/entity-importance-service";
import { createLLMProvider } from "@/services/llm/llm-provider-factory";
import { SESSION_SCRIPT_PROMPTS } from "@/lib/prompts/session-script-prompts";
import type { SessionScriptContext } from "@/lib/prompts/session-script-prompts";
import { getEntitiesWithRelationships } from "@/lib/graph/entity-utils";
import { MODEL_CONFIG } from "@/app-constants";
import { HIGH_RANGE, MEDIUM_RANGE } from "@/lib/importance-config";
import { getFileTypeFromName } from "@/lib/file-utils";
import {
  ENTITY_TYPE_NPCS,
  ENTITY_TYPE_LOCATIONS,
  ENTITY_TYPE_PCS,
} from "@/lib/entity-type-constants";

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

/**
 * Helper function to get all player character entities
 * Queries for pcs entity type
 */
async function getPlayerCharacterEntities(
  entityDAO: any,
  campaignId: string
): Promise<any[]> {
  return await entityDAO.listEntitiesByCampaign(campaignId, {
    entityType: ENTITY_TYPE_PCS,
  });
}

// Tool to plan a session
export const planSession = tool({
  description:
    "Plan a complete game session with detailed, actionable session scripts. Generates comprehensive session plans with scenes, NPC details, location descriptions, and flexible sub-goals. Uses rich campaign context including session digests, entity graph, and world state.",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    sessionTitle: z.string().describe("The title of the session"),
    sessionType: z
      .enum(["combat", "social", "exploration", "mixed"])
      .optional()
      .describe("Type of session to plan (default: mixed)"),
    estimatedDuration: z
      .number()
      .optional()
      .describe("Estimated session duration in hours (default: 4)"),
    focusAreas: z
      .array(z.string())
      .optional()
      .describe("Specific areas to focus on in this session"),
    isOneOff: z
      .boolean()
      .optional()
      .describe(
        "Whether this is a one-off session (shopping, side quest, seasonal, etc.) that doesn't need to connect to the main campaign arc"
      ),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    {
      campaignId,
      sessionTitle,
      sessionType = "mixed",
      estimatedDuration = 4,
      focusAreas,
      isOneOff = false,
      jwt,
    },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[planSession] Using toolCallId:", toolCallId);

    console.log("[Tool] planSession received:", {
      campaignId,
      sessionTitle,
      sessionType,
      estimatedDuration,
      focusAreas,
      isOneOff,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] planSession - Environment found:", !!env);
      console.log("[Tool] planSession - JWT provided:", !!jwt);

      if (!env) {
        // If no environment, make HTTP request
        const response = await authenticatedFetch(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
          {
            method: "POST",
            jwt,
            body: JSON.stringify({
              campaignId,
              sessionTitle,
              sessionType,
              estimatedDuration,
              focusAreas,
              isOneOff,
            }),
          }
        );

        if (!response.ok) {
          const authError = await handleAuthError(response);
          if (authError) {
            return createToolError(authError, null, 401, toolCallId);
          }
          return createToolError(
            "Failed to plan session",
            `HTTP ${response.status}: ${await response.text()}`,
            500,
            toolCallId
          );
        }

        const result = (await response.json()) as any;
        return createToolSuccess(
          `Session plan created: ${result.title || sessionTitle}`,
          result,
          toolCallId
        );
      }

      // Work directly with the database
      const userId = extractUsernameFromJwt(jwt);
      console.log("[Tool] planSession - User ID extracted:", userId);

      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      const daoFactory = getDAOFactory(env);

      // Verify campaign exists and belongs to user
      const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found or access denied",
          404,
          toolCallId
        );
      }

      // Get OpenAI API key
      const openaiApiKey =
        env.OPENAI_API_KEY || (await daoFactory.getOpenAIKey(userId));

      if (!openaiApiKey) {
        return createToolError(
          "OpenAI API key required",
          "An OpenAI API key is required for session planning. Please provide one in your settings.",
          400,
          toolCallId
        );
      }

      // Gather rich context for planning
      console.log("[planSession] Gathering planning context...");

      // Get recent session digests (last 5)
      const recentDigestsRaw =
        await daoFactory.sessionDigestDAO.getRecentSessionDigests(
          campaignId,
          5
        );
      const recentDigests = recentDigestsRaw.map((digest) => ({
        sessionNumber: digest.sessionNumber,
        sessionDate: digest.sessionDate,
        keyEvents: digest.digestData?.last_session_recap?.key_events || [],
        openThreads: digest.digestData?.last_session_recap?.open_threads || [],
        stateChanges: {
          factions:
            digest.digestData?.last_session_recap?.state_changes?.factions ||
            [],
          locations:
            digest.digestData?.last_session_recap?.state_changes?.locations ||
            [],
          npcs:
            digest.digestData?.last_session_recap?.state_changes?.npcs || [],
        },
        nextSessionPlan: digest.digestData?.next_session_plan,
      }));

      // Search for relevant entities using PlanningContextService
      const planningService = new PlanningContextService(
        env.DB,
        env.VECTORIZE,
        openaiApiKey,
        env
      );

      // Get player character entities from the graph
      const playerCharacterEntities = await getPlayerCharacterEntities(
        daoFactory.entityDAO,
        campaignId
      );

      // Build a query to find relevant entities (including player characters)
      const searchQuery = `${sessionTitle} ${focusAreas?.join(" ") || ""} ${sessionType}`;
      const contextResults = await planningService.search({
        campaignId,
        query: searchQuery,
        limit: 10,
        applyRecencyWeighting: true,
      });

      // Extract entity IDs from context results
      const entityIds = new Set<string>();
      contextResults.forEach((result) => {
        if (result.relatedEntities) {
          result.relatedEntities.forEach((entity) => {
            entityIds.add(entity.entityId);
            // Also add neighbors
            entity.neighbors.forEach((neighbor) => {
              entityIds.add(neighbor.entityId);
            });
          });
        }
      });

      // Add player character entity IDs to the set so they're included in context
      playerCharacterEntities.forEach((pc) => {
        entityIds.add(pc.id);
      });

      // Get entity details including relationships
      const entityGraphService = new EntityGraphService(daoFactory.entityDAO);
      const filteredEntities = await getEntitiesWithRelationships(
        Array.from(entityIds).slice(0, 30),
        campaignId,
        daoFactory.entityDAO,
        entityGraphService,
        {
          maxDepth: 1,
          maxNeighbors: 5,
        }
      );

      // Extract character backstories from player character entities
      const characterBackstories = playerCharacterEntities.map((pc) => {
        let backstory: string | undefined;
        let goals: string[] | undefined;

        // Extract from content
        if (pc.content && typeof pc.content === "object") {
          const content = pc.content as any;
          backstory = content.backstory || content.summary || undefined;
          if (content.goals && Array.isArray(content.goals)) {
            goals = content.goals;
          } else if (typeof content.goals === "string") {
            goals = [content.goals];
          }
        } else if (typeof pc.content === "string") {
          backstory = pc.content;
        }

        // Also check metadata for additional character data
        if (pc.metadata && typeof pc.metadata === "object") {
          const metadata = pc.metadata as any;
          if (!backstory && metadata.backstory) {
            backstory = metadata.backstory;
          }
          if (!goals && metadata.goals) {
            goals = Array.isArray(metadata.goals)
              ? metadata.goals
              : [metadata.goals];
          }
        }

        return {
          name: pc.name,
          backstory,
          goals,
        };
      });

      // Get campaign resources
      const campaignResources =
        await daoFactory.campaignDAO.getCampaignResources(campaignId);

      // Build session script context
      const scriptContext: SessionScriptContext = {
        campaignName: campaign.name,
        sessionTitle,
        sessionType,
        estimatedDuration,
        focusAreas,
        recentSessionDigests: recentDigests,
        relevantEntities: filteredEntities,
        characterBackstories,
        campaignResources: campaignResources.map((r) => ({
          title: r.display_name || r.file_name,
          type: getFileTypeFromName(r.file_name),
        })),
        isOneOff,
      };

      // Generate the prompt
      const prompt =
        SESSION_SCRIPT_PROMPTS.formatSessionScriptPrompt(scriptContext);

      console.log("[planSession] Generating session script with LLM...");

      // Create LLM provider and generate script
      const llmProvider = createLLMProvider({
        provider: MODEL_CONFIG.PROVIDER.DEFAULT,
        apiKey: openaiApiKey,
        defaultModel: MODEL_CONFIG.OPENAI.SESSION_PLANNING,
        defaultTemperature:
          MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_TEMPERATURE,
        defaultMaxTokens: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_MAX_TOKENS,
      });

      const sessionScript = await llmProvider.generateSummary(prompt, {
        model: MODEL_CONFIG.OPENAI.SESSION_PLANNING,
        temperature: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_TEMPERATURE,
        maxTokens: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_MAX_TOKENS,
      });

      // Analyze for gaps
      const gaps = analyzeGaps(sessionScript, filteredEntities);

      console.log("[planSession] Session script generated, gaps:", gaps.length);

      return createToolSuccess(
        `Session script generated: ${sessionTitle}`,
        {
          sessionTitle,
          sessionType,
          estimatedDuration,
          focusAreas,
          script: sessionScript,
          gaps,
          contextSummary: {
            sessionDigestsUsed: recentDigests.length,
            entitiesReferenced: filteredEntities.length,
            charactersIncluded: characterBackstories.length,
          },
        },
        toolCallId
      );
    } catch (error) {
      console.error("Error planning session:", error);
      return createToolError(
        "Failed to plan session",
        error instanceof Error ? error.message : String(error),
        500,
        toolCallId
      );
    }
  },
});

/**
 * Analyze the generated script for world-building gaps
 */
function analyzeGaps(
  script: string,
  availableEntities: Array<{
    entityId: string;
    entityName: string;
    entityType: string;
  }>
): Array<{
  type: "npc" | "location" | "item" | "relationship" | "world_detail";
  description: string;
  suggestion: string;
}> {
  const gaps: Array<{
    type: "npc" | "location" | "item" | "relationship" | "world_detail";
    description: string;
    suggestion: string;
  }> = [];

  // Extract potential entity names from script (simple heuristic)
  const entityNamePattern =
    /\[\[([^\]]+)\]\]|"([^"]+)"|NPC[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
  const mentionedNames = new Set<string>();
  let match: RegExpExecArray | null;
  match = entityNamePattern.exec(script);
  while (match !== null) {
    const name = match[1] || match[2] || match[3];
    if (name && name.length > 2) {
      mentionedNames.add(name.trim());
    }
    match = entityNamePattern.exec(script);
  }

  // Check if mentioned names exist in available entities
  const availableNames = new Set(
    availableEntities.map((e) => e.entityName.toLowerCase())
  );

  mentionedNames.forEach((name) => {
    const lowerName = name.toLowerCase();
    if (!availableNames.has(lowerName)) {
      // Check if it looks like an NPC, location, or item
      if (
        script.toLowerCase().includes(`npc`) ||
        script.toLowerCase().includes(`character`) ||
        script.toLowerCase().includes(`speaks`) ||
        script.toLowerCase().includes(`says`)
      ) {
        gaps.push({
          type: "npc",
          description: `NPC "${name}" is mentioned in the script but not found in campaign entities`,
          suggestion: `Consider adding details about ${name} to the campaign, including their personality, motivations, and relationship to the party.`,
        });
      } else if (
        script.toLowerCase().includes(`location`) ||
        script.toLowerCase().includes(`place`) ||
        script.toLowerCase().includes(`area`)
      ) {
        gaps.push({
          type: "location",
          description: `Location "${name}" is mentioned in the script but not found in campaign entities`,
          suggestion: `Consider adding details about ${name} to the campaign, including its description, atmosphere, and key features.`,
        });
      } else {
        gaps.push({
          type: "world_detail",
          description: `"${name}" is mentioned in the script but not found in campaign entities`,
          suggestion: `Consider adding details about ${name} to ensure consistency and depth.`,
        });
      }
    }
  });

  return gaps;
}

// Tool to generate session hooks
export const generateSessionHooks = tool({
  description:
    "Generate engaging session hooks and story beats to start or continue a session",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    hookType: z
      .enum(["opening", "transition", "cliffhanger", "resolution"])
      .optional()
      .describe("Type of hook to generate (default: opening)"),
    context: z
      .string()
      .optional()
      .describe("Additional context for hook generation"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, hookType = "opening", context: _contextParam, jwt },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[generateSessionHooks] Using toolCallId:", toolCallId);

    console.log("[Tool] generateSessionHooks received:", {
      campaignId,
      hookType,
      context,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] generateSessionHooks - Environment found:", !!env);
      console.log("[Tool] generateSessionHooks - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log("[Tool] generateSessionHooks - User ID extracted:", userId);

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            401,
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

        // Get campaign data for hook generation
        const characters = await env.DB.prepare(
          "SELECT * FROM campaign_characters WHERE campaign_id = ?"
        )
          .bind(campaignId)
          .all();

        const resources = await env.DB.prepare(
          "SELECT * FROM campaign_resources WHERE campaign_id = ?"
        )
          .bind(campaignId)
          .all();

        // Generate session hooks
        const hooks = generateHooks(
          hookType,
          context,
          characters.results || [],
          resources.results || []
        );

        console.log("[Tool] Generated hooks:", hooks.length);

        return createToolSuccess(
          `Generated ${hooks.length} ${hookType} hooks`,
          {
            hookType,
            hooks,
            totalCount: hooks.length,
            context: {
              characters: characters.results?.length || 0,
              resources: resources.results?.length || 0,
            },
          },
          toolCallId
        );
      }

      // Otherwise, make HTTP request
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            campaignId,
            hookType,
            context,
          }),
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(authError, null, 401, toolCallId);
        }
        return createToolError(
          "Failed to generate session hooks",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = (await response.json()) as any;
      return createToolSuccess(
        `Generated ${result.hooks?.length || 0} ${hookType} hooks`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error generating session hooks:", error);
      return createToolError(
        "Failed to generate session hooks",
        error,
        500,
        toolCallId
      );
    }
  },
});

/**
 * Determines gap severity based on entity importance
 * Player characters should always be maximum importance (critical for missing data)
 * Other entities: high importance = important, medium = minor, low = no gap
 */
function getGapSeverityByImportance(
  entityType: string,
  importanceScore: number
): "critical" | "important" | "minor" {
  // Player characters should always be maximum importance - missing data is critical
  if (entityType === ENTITY_TYPE_PCS) {
    return "critical";
  }

  // High importance entities (80-100): missing data is important
  if (importanceScore >= HIGH_RANGE.min) {
    return "important";
  }

  // Medium importance (60-79): missing data is minor
  if (importanceScore >= MEDIUM_RANGE.min) {
    return "minor";
  }

  // Low importance (<60): missing data is minor (or could be ignored, but we'll flag it as minor)
  return "minor";
}

/**
 * Analyzes a player character entity for completeness
 * Checks for motivations, goals, relationships, enemies, spotlight moments, etc.
 * Considers entity importance when determining gap severity.
 */
async function analyzePlayerCharacterCompleteness(
  character: any,
  campaignId: string,
  entityGraphService: EntityGraphService,
  importanceService?: EntityImportanceService
): Promise<
  Array<{
    type: string;
    severity: "critical" | "important" | "minor";
    description: string;
    suggestion: string;
  }>
> {
  const gaps: Array<{
    type: string;
    severity: "critical" | "important" | "minor";
    description: string;
    suggestion: string;
  }> = [];

  const characterName = character.name;
  let content: any = {};
  let metadata: any = {};

  // Extract content and metadata
  if (character.content && typeof character.content === "object") {
    content = character.content;
  } else if (typeof character.content === "string") {
    try {
      content = JSON.parse(character.content);
    } catch {
      content = { backstory: character.content };
    }
  }

  if (character.metadata && typeof character.metadata === "object") {
    metadata = character.metadata;
  } else if (typeof character.metadata === "string") {
    try {
      metadata = JSON.parse(character.metadata);
    } catch {
      metadata = {};
    }
  }

  // Get entity importance to determine gap severity
  let importanceScore = 100; // Default to max for player characters
  if (importanceService) {
    try {
      importanceScore = await importanceService.getEntityImportance(
        campaignId,
        character.id
      );
    } catch (error) {
      console.warn(
        `[analyzePlayerCharacterCompleteness] Failed to get importance for ${character.id}:`,
        error
      );
      // Default to max importance for player characters if we can't get it
      importanceScore = 100;
    }
  }

  // Check for backstory
  const hasBackstory = !!(
    content.backstory ||
    content.summary ||
    metadata.backstory
  );
  if (!hasBackstory) {
    const severity = getGapSeverityByImportance(
      character.entityType,
      importanceScore
    );
    gaps.push({
      type: `character_backstory_${character.id}`,
      severity,
      description: `${characterName} lacks a backstory or summary.`,
      suggestion: `Add a backstory for ${characterName} to help create meaningful character moments and tie-ins to the campaign world.`,
    });
  }

  // Check for motivations
  const hasMotivations = !!(
    content.motivations ||
    content.motivation ||
    metadata.motivations ||
    metadata.motivation ||
    (content.personalityTraits &&
      typeof content.personalityTraits === "string" &&
      content.personalityTraits.length > 50)
  );
  if (!hasMotivations) {
    const severity = getGapSeverityByImportance(
      character.entityType,
      importanceScore
    );
    gaps.push({
      type: `character_motivations_${character.id}`,
      severity,
      description: `${characterName} lacks defined motivations.`,
      suggestion: `Define what motivates ${characterName}. What drives them? What do they care about? This helps create compelling character-driven moments in sessions.`,
    });
  }

  // Check for goals
  const hasGoals = !!(
    (content.goals &&
      Array.isArray(content.goals) &&
      content.goals.length > 0) ||
    (content.goals &&
      typeof content.goals === "string" &&
      content.goals.trim().length > 0) ||
    (metadata.goals &&
      Array.isArray(metadata.goals) &&
      metadata.goals.length > 0) ||
    (metadata.goals &&
      typeof metadata.goals === "string" &&
      metadata.goals.trim().length > 0)
  );
  if (!hasGoals) {
    const severity = getGapSeverityByImportance(
      character.entityType,
      importanceScore
    );
    gaps.push({
      type: `character_goals_${character.id}`,
      severity,
      description: `${characterName} lacks defined goals.`,
      suggestion: `Define goals for ${characterName}. What do they want to achieve? Short-term and long-term goals help drive character arcs and create opportunities for character spotlight moments.`,
    });
  }

  // Check for relationships (who they know)
  let hasRelationships = false;
  try {
    const neighbors = await entityGraphService.getNeighbors(
      campaignId,
      character.id,
      { maxDepth: 1 }
    );
    hasRelationships = neighbors.length > 0;

    if (!hasRelationships) {
      const severity = getGapSeverityByImportance(
        character.entityType,
        importanceScore
      );
      gaps.push({
        type: `character_relationships_${character.id}`,
        severity,
        description: `${characterName} has no connections to other entities in the campaign world.`,
        suggestion: `Connect ${characterName} to NPCs, locations, factions, or other entities. Who do they know? Who are their allies? This helps create meaningful interactions and story hooks.`,
      });
    } else {
      // Check if they have enemies (adversarial relationships)
      const hasEnemies = neighbors.some((neighbor) => {
        const relType = neighbor.relationshipType?.toLowerCase() || "";
        return (
          relType.includes("enemy") ||
          relType.includes("rival") ||
          relType.includes("hostile") ||
          relType.includes("opposed")
        );
      });

      if (!hasEnemies && neighbors.length > 0) {
        // Enemies are less critical - always minor unless it's a player character
        const severity =
          character.entityType === ENTITY_TYPE_PCS ? "important" : "minor";
        gaps.push({
          type: `character_enemies_${character.id}`,
          severity,
          description: `${characterName} has relationships but no clear enemies or antagonists.`,
          suggestion: `Consider adding enemies or rivals for ${characterName}. Conflict creates drama and gives characters something to overcome. Who opposes them?`,
        });
      }
    }
  } catch (error) {
    console.warn(
      `[analyzePlayerCharacterCompleteness] Failed to check relationships for ${character.id}:`,
      error
    );
  }

  // Check for spotlight moments / character arc planning
  const hasSpotlightMoments = !!(
    content.spotlightMoments ||
    content.spotlight_moments ||
    content.characterArc ||
    content.character_arc ||
    metadata.spotlightMoments ||
    metadata.spotlight_moments ||
    metadata.characterArc ||
    metadata.character_arc ||
    (content.goals &&
      Array.isArray(content.goals) &&
      content.goals.some(
        (g: any) =>
          typeof g === "string" &&
          (g.toLowerCase().includes("arc") ||
            g.toLowerCase().includes("spotlight"))
      ))
  );
  if (!hasSpotlightMoments) {
    // Spotlight moments are critical for player characters, minor for others
    const severity =
      character.entityType === ENTITY_TYPE_PCS ? "important" : "minor";
    gaps.push({
      type: `character_spotlight_${character.id}`,
      severity,
      description: `No spotlight moments or character arc planning found for ${characterName}.`,
      suggestion: `Plan special moments in the campaign arc for ${characterName}. What character-specific moments, revelations, or challenges will they face? This ensures each player gets meaningful character development.`,
    });
  }

  // Check for personality traits (helps with roleplay)
  const hasPersonality = !!(
    content.personalityTraits ||
    content.personality_traits ||
    content.personality ||
    metadata.personalityTraits ||
    metadata.personality_traits ||
    metadata.personality
  );
  if (!hasPersonality && !hasBackstory) {
    // Personality is less critical - use importance but cap at "important" (not critical)
    const baseSeverity = getGapSeverityByImportance(
      character.entityType,
      importanceScore
    );
    const severity = baseSeverity === "critical" ? "important" : baseSeverity;
    gaps.push({
      type: `character_personality_${character.id}`,
      severity,
      description: `${characterName} lacks personality traits or defining characteristics.`,
      suggestion: `Add personality traits, quirks, or defining characteristics for ${characterName}. This helps you roleplay them consistently and create memorable moments.`,
    });
  }

  return gaps;
}

// Tool to check planning readiness
export const checkPlanningReadiness = tool({
  description:
    "Check if a campaign is ready for session planning by analyzing campaign state and identifying gaps. Returns readiness status and a list of gaps that should be filled before planning.",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ campaignId, jwt }, context?: any): Promise<ToolResult> => {
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[checkPlanningReadiness] Using toolCallId:", toolCallId);

    try {
      const env = getEnvFromContext(context);
      if (!env) {
        return createToolError(
          "Environment not available",
          "Server environment is required",
          500,
          toolCallId
        );
      }

      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      const daoFactory = getDAOFactory(env);

      // Verify campaign exists
      const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found or access denied",
          404,
          toolCallId
        );
      }

      const gaps: Array<{
        type: string;
        severity: "critical" | "important" | "minor";
        description: string;
        suggestion: string;
      }> = [];

      // Check for entities (NPCs, locations) using efficient count queries
      // This avoids fetching all entities which could be 1500+ in large campaigns
      const [npcsCount, locationsCount, totalEntitiesCount] = await Promise.all(
        [
          daoFactory.entityDAO.getEntityCountByCampaign(campaignId, {
            entityType: ENTITY_TYPE_NPCS,
          }),
          daoFactory.entityDAO.getEntityCountByCampaign(campaignId, {
            entityType: ENTITY_TYPE_LOCATIONS,
          }),
          daoFactory.entityDAO.getEntityCountByCampaign(campaignId, {}),
        ]
      );

      // Check for session digests
      // Note: No session digests is acceptable for campaigns that haven't started yet
      // This is not a critical gap - we'll encourage creating one after the first session
      const digests =
        await daoFactory.sessionDigestDAO.getSessionDigestsByCampaign(
          campaignId
        );
      if (digests.length === 0) {
        // If campaign has entities (NPCs, locations, etc.), it might have started but no digests recorded
        // If no entities, campaign likely hasn't started yet - both are acceptable states
        const hasEntities = totalEntitiesCount > 0;
        gaps.push({
          type: "session_digest",
          severity: "important",
          description: hasEntities
            ? "No session digests found. Recording session digests helps track what happened and provides context for planning future sessions."
            : "No session digests yet. This is normal for campaigns that haven't started. After your first session, creating a session digest will help track what happened and provide context for planning future sessions.",
          suggestion: hasEntities
            ? "Create a session digest for your previous sessions to provide context for planning the next session."
            : "After your first session, create a session digest to record what happened. This will help track the campaign's progress and provide context for planning future sessions.",
        });
      }

      if (npcsCount === 0) {
        gaps.push({
          type: "npcs",
          severity: "important",
          description: "No NPCs found in the campaign.",
          suggestion:
            "Add at least a few NPCs to provide characters for interactions and story development.",
        });
      }

      if (locationsCount === 0) {
        gaps.push({
          type: "locations",
          severity: "important",
          description: "No locations found in the campaign.",
          suggestion:
            "Add at least one location (starting location or current location) to provide a setting for the session.",
        });
      }

      // Check for player character entities
      // Only fetch player characters if we need to analyze them for completeness
      const playerCharactersCount =
        await daoFactory.entityDAO.getEntityCountByCampaign(campaignId, {
          entityType: ENTITY_TYPE_PCS,
        });
      let playerCharacters: any[] = [];
      if (playerCharactersCount > 0) {
        // Only fetch player characters if they exist (for completeness analysis)
        playerCharacters = await daoFactory.entityDAO.listEntitiesByCampaign(
          campaignId,
          { entityType: ENTITY_TYPE_PCS }
        );
      }
      if (playerCharacters.length === 0) {
        gaps.push({
          type: "characters",
          severity: "minor",
          description: "No player characters found in the campaign.",
          suggestion:
            "Adding character backstories and goals as entities can help create more personalized session moments and connect characters to the campaign's entity graph.",
        });
      } else {
        // Analyze each player character for completeness
        const entityGraphService = new EntityGraphService(daoFactory.entityDAO);
        const importanceService = new EntityImportanceService(
          daoFactory.entityDAO,
          daoFactory.communityDAO,
          daoFactory.entityImportanceDAO
        );
        for (const character of playerCharacters) {
          const characterGaps = await analyzePlayerCharacterCompleteness(
            character,
            campaignId,
            entityGraphService,
            importanceService
          );
          gaps.push(...characterGaps);
        }
      }

      // Determine readiness
      const criticalGaps = gaps.filter((g) => g.severity === "critical");
      const isReady = criticalGaps.length === 0;

      return createToolSuccess(
        isReady
          ? "Campaign is ready for session planning"
          : `Campaign has ${criticalGaps.length} critical gap(s) that should be addressed before planning`,
        {
          isReady,
          gaps,
          summary: {
            totalGaps: gaps.length,
            criticalGaps: criticalGaps.length,
            importantGaps: gaps.filter((g) => g.severity === "important")
              .length,
            minorGaps: gaps.filter((g) => g.severity === "minor").length,
          },
          campaignState: {
            sessionDigests: digests.length,
            npcs: npcsCount,
            locations: locationsCount,
            characters: playerCharactersCount,
            totalEntities: totalEntitiesCount,
          },
        },
        toolCallId
      );
    } catch (error) {
      console.error("Error checking planning readiness:", error);
      return createToolError(
        "Failed to check planning readiness",
        error instanceof Error ? error.message : String(error),
        500,
        toolCallId
      );
    }
  },
});

// Helper function to generate hooks
function generateHooks(
  type: string,
  _context: string = "",
  _characters: any[] = [],
  _resources: any[] = []
): any[] {
  const hooks = [];

  switch (type) {
    case "opening":
      hooks.push(
        {
          title: "Mysterious Message",
          description:
            "The party receives an urgent message from a mysterious source",
          setup: "A raven delivers a sealed letter with an urgent request",
          payoff: "The message leads to an important discovery or quest",
        },
        {
          title: "Unexpected Visitor",
          description: "An unexpected NPC arrives with important news",
          setup: "A familiar or new NPC appears with urgent information",
          payoff:
            "The visitor's information sets up the session's main conflict",
        }
      );
      break;
    case "transition":
      hooks.push({
        title: "Fork in the Road",
        description: "The party must choose between multiple paths",
        setup: "Present two or more equally compelling options",
        payoff: "Each choice leads to different consequences and opportunities",
      });
      break;
    case "cliffhanger":
      hooks.push({
        title: "Sudden Interruption",
        description: "Something unexpected interrupts the current situation",
        setup: "An alarm sounds, a messenger arrives, or danger appears",
        payoff: "The interruption creates urgency and drives the story forward",
      });
      break;
    case "resolution":
      hooks.push({
        title: "Revelation",
        description: "A hidden truth is revealed",
        setup: "Information that changes the party's understanding",
        payoff: "The revelation provides closure or sets up future sessions",
      });
      break;
  }

  return hooks;
}
