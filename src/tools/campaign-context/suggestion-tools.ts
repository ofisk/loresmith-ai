import { tool } from "ai";
import { z } from "zod";
import {
	API_CONFIG,
	AUTH_CODES,
	getGenerationModelForProvider,
	MODEL_CONFIG,
	type ToolResult,
} from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import type { PlanningTaskStatus } from "@/dao/planning-task-dao";
import {
	CAMPAIGN_READINESS_ENTITY_TYPES,
	isValidEntityType,
	type StructuredEntityType,
} from "@/lib/entity/entity-types";
import { getEnvVar } from "@/lib/env-utils";
import { METADATA_ANALYSIS_PROMPTS } from "@/lib/prompts/metadata-analysis-prompts";
import { getAssessmentService } from "@/lib/service-factory";
import { authenticatedFetch, handleAuthError } from "@/lib/tool-auth";
import type { Env } from "@/middleware/auth";
import { CharacterEntitySyncService } from "@/services/campaign/character-entity-sync-service";
import { createLLMProvider } from "@/services/llm/llm-provider-factory";
import { getPlanningServices } from "@/services/rag/rag-service-factory";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	extractUsernameFromJwt,
	getEnvFromContext,
	requireCampaignAccessForTool,
	requireGMRole,
	type ToolExecuteOptions,
} from "@/tools/utils";
import {
	buildReadinessRecommendations,
	CHECKLIST_ITEMS,
	computeEntityTypeCounts,
	type EntityReadinessStats,
	generateSuggestions,
	getCampaignState,
	isThemePreferenceEntity,
	type SemanticChecklistAnalysis,
} from "./suggestion-utils";

const getCampaignSuggestionsSchema = z.object({
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
});

export const getCampaignSuggestions = tool({
	description:
		"Get intelligent suggestions for campaign development, session planning, and story progression. Suggestions should be informed by the Campaign Planning Checklist, prioritizing foundational elements (Campaign Foundation, World & Setting Basics, Starting Location) before later stages. CRITICAL: If you need suggestions for multiple types (e.g., world, session, plot), pass them as an array in a SINGLE call: suggestionType=['world', 'session', 'plot']. Do NOT make separate calls for each type. Call this tool only ONCE per user request, passing all needed suggestion types as an array. After calling this tool, you MUST immediately generate a text response to the user - do NOT make additional tool calls.",
	inputSchema: getCampaignSuggestionsSchema,
	execute: async (
		input: z.infer<typeof getCampaignSuggestionsSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, suggestionType, context: _contextParam, jwt } = input;
		const suggestionTypes = Array.isArray(suggestionType)
			? suggestionType
			: [suggestionType || "session"];
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);

			// If we have environment, work directly with the database
			if (env) {
				const access = await requireCampaignAccessForTool({
					env: env as Env,
					campaignId,
					jwt,
					toolCallId,
				});
				if ("toolCallId" in access) {
					return access;
				}
				const { campaign, userId } = access;

				// Verify campaign exists and belongs to user using DAO
				const daoFactory = getDAOFactory(env as Env);

				const gmError = await requireGMRole(
					env as Env,
					campaignId,
					userId,
					toolCallId
				);
				if (gmError) return gmError;

				const planningTaskDAO = daoFactory.planningTaskDAO;

				// Load existing open planning tasks so we do not re-suggest them.
				const existingOpenTasks = await planningTaskDAO.listByCampaign(
					campaignId,
					{
						status: ["pending", "in_progress"] as PlanningTaskStatus[],
					}
				);
				const existingTitleSet = new Set(
					existingOpenTasks
						.map((t: any) => t.title?.trim().toLowerCase())
						.filter(Boolean) as string[]
				);

				// Sync character_backstory entries to entities before getting characters
				try {
					const syncService = new CharacterEntitySyncService(env as Env);
					await syncService.syncAllCharacterBackstories(campaignId);
				} catch (_syncError) {
					// Don't fail suggestions if sync fails
				}

				// Use AssessmentService to get all characters (now only queries entities)
				const assessmentService = getAssessmentService(env as Env);
				const allCharacters =
					await assessmentService.getCampaignCharacters(campaignId);
				const allResources =
					await assessmentService.getCampaignResources(campaignId);

				// Generate suggestions for all requested types,
				// filtering out any that already exist as open planning tasks.
				const newSuggestions: any[] = [];
				const suggestionsByType: Record<string, any[]> = {};

				for (const type of suggestionTypes) {
					const typeSuggestions = generateSuggestions(
						type,
						allCharacters,
						allResources,
						_contextParam
					);

					const filtered = typeSuggestions.filter((s: any) => {
						const rawTitle = typeof s.title === "string" ? s.title : "";
						const key = rawTitle.trim().toLowerCase();
						if (!key) return false;
						if (existingTitleSet.has(key)) {
							return false;
						}
						existingTitleSet.add(key);
						return true;
					});

					suggestionsByType[type] = filtered;
					newSuggestions.push(...filtered);
				}

				// Persist new suggestions as planning tasks ("next steps") so they appear
				// in the app's Next steps UI and can be tracked over time.
				let createdPlanningTasks: any[] = [];
				if (newSuggestions.length > 0) {
					createdPlanningTasks = await planningTaskDAO.bulkCreatePlanningTasks(
						campaignId,
						newSuggestions.map((s: any) => ({
							title: s.title as string,
							description:
								typeof s.description === "string" ? s.description : null,
						})),
						toolCallId
					);
					if (
						createdPlanningTasks.length > 0 &&
						env &&
						"NOTIFICATIONS" in env
					) {
						const { notifyNextStepsCreated } = await import(
							"@/lib/notifications"
						);
						await notifyNextStepsCreated(
							env as Env,
							userId,
							campaign.name,
							createdPlanningTasks.length
						);
					}
				}

				const responseMessage =
					suggestionTypes.length === 1
						? `Generated ${newSuggestions.length} ${suggestionTypes[0]} suggestions`
						: `Generated ${newSuggestions.length} suggestions across ${suggestionTypes.length} types`;

				return createToolSuccess(
					responseMessage,
					{
						suggestionType:
							suggestionTypes.length === 1
								? suggestionTypes[0]
								: suggestionTypes,
						suggestions: newSuggestions,
						suggestionsByType,
						totalCount: newSuggestions.length,
						context: {
							characters: allCharacters.length,
							resources: allResources.length,
						},
						details: {
							characterCount: allCharacters.length,
							resourceCount: allResources.length,
							planningTasksCreated: createdPlanningTasks.length,
							planningTasks: createdPlanningTasks,
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
						context: _contextParam,
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
			return createToolError(
				"Failed to get campaign suggestions",
				error,
				500,
				toolCallId
			);
		}
	},
});

const assessCampaignReadinessSchema = z.object({
	campaignId: commonSchemas.campaignId,
	assessmentType: z
		.enum(["session", "story", "characters", "world"])
		.optional()
		.describe("Type of readiness assessment (default: session)"),
	jwt: commonSchemas.jwt,
});

export const assessCampaignReadiness = tool({
	description:
		"Assess the campaign's readiness for the next session and provide recommendations. When interpreting results, reference the Campaign Planning Checklist to provide structured, prioritized recommendations based on logical dependencies (foundational elements before later stages).",
	inputSchema: assessCampaignReadinessSchema,
	execute: async (
		input: z.infer<typeof assessCampaignReadinessSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, assessmentType = "session", jwt } = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const env = getEnvFromContext(options);

			// If we have environment, work directly with the database
			if (env) {
				const userId = extractUsernameFromJwt(jwt);

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

				const gmError = await requireGMRole(
					env as Env,
					campaignId,
					userId,
					toolCallId
				);
				if (gmError) return gmError;

				// Sync character_backstory entries to entities before assessment
				try {
					const syncService = new CharacterEntitySyncService(env as Env);
					await syncService.syncAllCharacterBackstories(campaignId);
				} catch (_syncError) {
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
			return createToolError(
				"Failed to assess campaign readiness",
				error,
				500,
				toolCallId
			);
		}
	},
});

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

	const providerEnvVar =
		MODEL_CONFIG.PROVIDER.DEFAULT === "anthropic"
			? "ANTHROPIC_API_KEY"
			: "OPENAI_API_KEY";
	const providerApiKeyRaw = await getEnvVar(env, providerEnvVar, false);
	const providerApiKey = providerApiKeyRaw.trim();
	if (!providerApiKey) {
		return coverage;
	}

	try {
		const coverageSchema = z.object({
			coverage: z
				.record(z.string(), z.boolean())
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
			apiKey: providerApiKey,
			defaultModel: getGenerationModelForProvider("PIPELINE_LIGHT"),
			defaultTemperature: MODEL_CONFIG.PARAMETERS.METADATA_ANALYSIS_TEMPERATURE,
			defaultMaxTokens: MODEL_CONFIG.PARAMETERS.METADATA_ANALYSIS_MAX_TOKENS,
		});

		const result = await llmProvider.generateStructuredOutput<
			z.infer<typeof coverageSchema>
		>(prompt, {
			model: getGenerationModelForProvider("PIPELINE_LIGHT"),
			temperature: MODEL_CONFIG.PARAMETERS.METADATA_ANALYSIS_TEMPERATURE,
			maxTokens: MODEL_CONFIG.PARAMETERS.METADATA_ANALYSIS_MAX_TOKENS,
		});

		const parsed = coverageSchema.safeParse(result);
		if (!parsed.success) {
			return coverage;
		}
		return parsed.data.coverage as Record<string, boolean>;
	} catch (_error) {
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
	_campaignName?: string,
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
			} catch (_error) {}
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

		const { planningContext } = await getPlanningServices(env);
		if (!env.DB || !env.VECTORIZE || !planningContext) {
			// Semantic search not available, return coverage from metadata only
			return { coverage, entityStats };
		}

		// 1) Check existing planning-context index for checklist coverage
		try {
			if (!planningContext) {
				return { coverage, entityStats };
			}

			// Use CHECKLIST_ITEMS for semantic search queries
			for (const { key, description: query } of CHECKLIST_ITEMS) {
				try {
					const results = await planningContext.search({
						campaignId,
						query,
						limit: 3,
					});

					// Consider covered if we find at least one relevant result with good similarity
					// OR if already covered by metadata (metadata takes precedence)
					const semanticCoverage =
						results.length > 0 && results[0].similarityScore > 0.6;
					coverage[key] = coverage[key] || semanticCoverage;
				} catch (_error) {
					// Preserve existing coverage from metadata if available
					coverage[key] = coverage[key] ?? false;
				}
			}
		} catch (_error) {}

		// 2) Also analyze entities + graph relationships for readiness guidance
		try {
			const daoFactory = getDAOFactory(env);
			const entityDAO = daoFactory.entityDAO;
			const graphService = daoFactory.entityGraphService;

			const allEntities = await entityDAO.listEntitiesByCampaign(campaignId, {
				excludeShardStatuses: ["rejected", "deleted"],
			});

			const entityTypeCounts = computeEntityTypeCounts(allEntities);

			// Treat conversational theme_preference entities as covering tone + core themes
			for (const entity of allEntities) {
				if (isThemePreferenceEntity(entity)) {
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
				} catch (_error) {}

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
		} catch (_error) {}
	} catch (_error) {
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

	recommendations.push(
		...buildReadinessRecommendations({
			coverage,
			entityStats,
			characters,
			resources,
			score,
		})
	);

	return {
		campaignState: getCampaignState(Math.min(score, 100)),
		recommendations,
		details: {
			characters: characters.length,
			resources: resources.length,
			context: context.length,
			semanticCoverage: semanticAnalysis || {},
		},
	};
}
