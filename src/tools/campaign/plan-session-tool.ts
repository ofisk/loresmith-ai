import { tool } from "ai";
import { z } from "zod";
import {
	API_CONFIG,
	getGenerationModelForProvider,
	MODEL_CONFIG,
	type ToolResult,
} from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import { getEnvVar } from "@/lib/env-utils";
import { getFileTypeFromName } from "@/lib/file/file-utils";
import { getEntitiesWithRelationships } from "@/lib/graph/entity-utils";
import type { SessionScriptContext } from "@/lib/prompts/session-script-prompts";
import { SESSION_SCRIPT_PROMPTS } from "@/lib/prompts/session-script-prompts";
import { authenticatedFetch, handleAuthError } from "@/lib/tool-auth";
import { createLLMProvider } from "@/services/llm/llm-provider-factory";
import { getPlanningServices } from "@/services/rag/rag-service-factory";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	getEnvFromContext,
	requireCampaignAccessForTool,
	requireGMRole,
	type ToolExecuteOptions,
} from "@/tools/utils";
import {
	analyzeGaps,
	getPlayerCharacterEntities,
} from "./planning-tools-utils";

const encounterSpecSchema = z
	.object({
		encounterSummary: z.string().optional(),
		targetDifficulty: z.string().optional(),
		location: z
			.object({
				entityId: z.string().nullable().optional(),
				name: z.string().optional(),
				reasoning: z.string().optional(),
			})
			.optional(),
		composition: z
			.array(
				z.object({
					entityId: z.string().optional(),
					name: z.string(),
					count: z.number().int().min(1),
					role: z.string().optional(),
					threatEstimate: z.string().optional(),
					gmUsageAdvice: z.array(z.string()).optional(),
				})
			)
			.optional(),
		environment: z
			.object({
				terrainFeatures: z.array(z.string()).optional(),
				hazards: z.array(z.string()).optional(),
				dynamicElements: z.array(z.string()).optional(),
			})
			.optional(),
		tactics: z
			.object({
				openingMoves: z.array(z.string()).optional(),
				midFightTwists: z.array(z.string()).optional(),
				retreatOrResolve: z.array(z.string()).optional(),
			})
			.optional(),
		narrativeHooks: z.array(z.string()).optional(),
		generalCombatAdvice: z.array(z.string()).optional(),
		sourceContext: z
			.object({
				seedEntityIds: z.array(z.string()).optional(),
				planningSignals: z.array(z.string()).optional(),
			})
			.optional(),
	})
	.passthrough();

const planSessionSchema = z.object({
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
	encounterSpec: encounterSpecSchema
		.optional()
		.describe(
			"Optional prebuilt encounter spec to include in session planning context."
		),
	jwt: commonSchemas.jwt,
});

export const planSession = tool({
	description:
		"Plan a complete game session with detailed, actionable session scripts. Generates comprehensive session plans with scenes, NPC details, location descriptions, and flexible sub-goals. Uses rich campaign context including session digests, entity graph, and world state.",
	inputSchema: planSessionSchema,
	execute: async (
		input: z.infer<typeof planSessionSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const {
			campaignId,
			sessionTitle,
			sessionType = "mixed",
			estimatedDuration = 4,
			focusAreas,
			isOneOff = false,
			encounterSpec,
			jwt,
		} = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);

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
							encounterSpec,
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

			if (!env.DB || !env.VECTORIZE) {
				return createToolError(
					"Database or vector index not available",
					"Session planning requires database and vector index.",
					503,
					toolCallId
				);
			}

			const daoFactory = getDAOFactory(env);
			const access = await requireCampaignAccessForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in access) {
				return access;
			}
			const { userId, campaign } = access;

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

			const providerEnvVar =
				MODEL_CONFIG.PROVIDER.DEFAULT === "anthropic"
					? "ANTHROPIC_API_KEY"
					: "OPENAI_API_KEY";
			const providerApiKeyRaw = await getEnvVar(
				env as any,
				providerEnvVar,
				false
			);
			const providerApiKey = providerApiKeyRaw.trim() || undefined;
			if (!providerApiKey) {
				return createToolError(
					`${MODEL_CONFIG.PROVIDER.DEFAULT} API key not configured`,
					"AI is not configured for this environment.",
					503,
					toolCallId
				);
			}

			const { planningContext } = await getPlanningServices(env);

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

			if (!planningContext) {
				return createToolError(
					"Planning context dependencies not configured",
					"Session planning requires database, vector index, and embedding provider configuration.",
					503,
					toolCallId
				);
			}

			const playerCharacterEntities = await getPlayerCharacterEntities(
				daoFactory.entityDAO,
				campaignId
			);

			const searchQuery = `${sessionTitle} ${focusAreas?.join(" ") || ""} ${sessionType}`;
			const contextResults = await planningContext.search({
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

			const entityGraphService = daoFactory.entityGraphService;
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
				sessionType: sessionType as SessionScriptContext["sessionType"],
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
				encounterSpec,
			};

			const prompt =
				SESSION_SCRIPT_PROMPTS.formatSessionScriptPrompt(scriptContext);

			const llmProvider = createLLMProvider({
				provider: MODEL_CONFIG.PROVIDER.DEFAULT,
				apiKey: providerApiKey,
				defaultModel: getGenerationModelForProvider("SESSION_PLANNING"),
				defaultTemperature:
					MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_TEMPERATURE,
				defaultMaxTokens: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_MAX_TOKENS,
			});

			const sessionScript = await llmProvider.generateSummary(prompt, {
				model: getGenerationModelForProvider("SESSION_PLANNING"),
				temperature: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_TEMPERATURE,
				maxTokens: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_MAX_TOKENS,
			});

			const gaps = analyzeGaps(sessionScript, filteredEntities);

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
						encounterSpecIncluded: !!encounterSpec,
					},
				},
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to plan session",
				error instanceof Error ? error.message : String(error),
				500,
				toolCallId
			);
		}
	},
});
