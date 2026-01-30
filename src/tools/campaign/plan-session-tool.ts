import type { VectorizeIndex } from "@cloudflare/workers-types";
import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "@/app-constants";
import { authenticatedFetch, handleAuthError } from "@/lib/tool-auth";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  getEnvFromContext,
} from "../utils";
import { getDAOFactory } from "@/dao/dao-factory";
import { PlanningContextService } from "@/services/rag/planning-context-service";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { createLLMProvider } from "@/services/llm/llm-provider-factory";
import { SESSION_SCRIPT_PROMPTS } from "@/lib/prompts/session-script-prompts";
import type { SessionScriptContext } from "@/lib/prompts/session-script-prompts";
import { getEntitiesWithRelationships } from "@/lib/graph/entity-utils";
import { MODEL_CONFIG } from "@/app-constants";
import { getFileTypeFromName } from "@/lib/file-utils";
import {
  getPlayerCharacterEntities,
  analyzeGaps,
} from "./planning-tools-utils";

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
    context?: { env?: unknown; toolCallId?: string }
  ): Promise<ToolResult> => {
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
      const env = getEnvFromContext(context);
      console.log("[Tool] planSession - Environment found:", !!env);
      console.log("[Tool] planSession - JWT provided:", !!jwt);

      if (!env) {
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

        const result = (await response.json()) as { title?: string };
        return createToolSuccess(
          `Session plan created: ${result.title || sessionTitle}`,
          result,
          toolCallId
        );
      }

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

      if (!env.DB || !env.VECTORIZE) {
        return createToolError(
          "Database or vector index not available",
          "Session planning requires database and vector index.",
          503,
          toolCallId
        );
      }

      const daoFactory = getDAOFactory(env);

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

      console.log("[planSession] Gathering planning context...");

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

      const planningService = new PlanningContextService(
        env.DB,
        env.VECTORIZE as VectorizeIndex,
        openaiApiKey,
        env
      );

      const playerCharacterEntities = await getPlayerCharacterEntities(
        daoFactory.entityDAO,
        campaignId
      );

      const searchQuery = `${sessionTitle} ${focusAreas?.join(" ") || ""} ${sessionType}`;
      const contextResults = await planningService.search({
        campaignId,
        query: searchQuery,
        limit: 10,
        applyRecencyWeighting: true,
      });

      const entityIds = new Set<string>();
      contextResults.forEach((result) => {
        if (result.relatedEntities) {
          result.relatedEntities.forEach((entity) => {
            entityIds.add(entity.entityId);
            entity.neighbors.forEach((neighbor) => {
              entityIds.add(neighbor.entityId);
            });
          });
        }
      });

      playerCharacterEntities.forEach((pc) => {
        entityIds.add(pc.id);
      });

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

      const characterBackstories = playerCharacterEntities.map((pc) => {
        let backstory: string | undefined;
        let goals: string[] | undefined;

        if (pc.content && typeof pc.content === "object") {
          const content = pc.content as Record<string, unknown>;
          backstory = (content.backstory ?? content.summary) as
            | string
            | undefined;
          if (content.goals && Array.isArray(content.goals)) {
            goals = content.goals as string[];
          } else if (typeof content.goals === "string") {
            goals = [content.goals];
          }
        } else if (typeof pc.content === "string") {
          backstory = pc.content;
        }

        if (pc.metadata && typeof pc.metadata === "object") {
          const metadata = pc.metadata as Record<string, unknown>;
          if (!backstory && metadata.backstory) {
            backstory = metadata.backstory as string;
          }
          if (!goals && metadata.goals) {
            goals = Array.isArray(metadata.goals)
              ? (metadata.goals as string[])
              : [metadata.goals as string];
          }
        }

        return {
          name: pc.name,
          backstory,
          goals,
        };
      });

      const campaignResources =
        await daoFactory.campaignDAO.getCampaignResources(campaignId);

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

      const prompt =
        SESSION_SCRIPT_PROMPTS.formatSessionScriptPrompt(scriptContext);

      console.log("[planSession] Generating session script with LLM...");

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
