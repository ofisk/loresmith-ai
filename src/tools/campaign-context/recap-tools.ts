import { tool } from "ai";
import { z } from "zod";
import { MODEL_CONFIG, type ToolResult } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import type { PlanningTaskStatus } from "@/dao/planning-task-dao";
import { getEnvVar } from "@/lib/env-utils";
import { RecapService } from "@/services/core/recap-service";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	getEnvFromContext,
	requireCampaignAccessForTool,
	requireCanSeeSpoilersForTool,
	requireGMRole,
	type ToolExecuteOptions,
} from "@/tools/utils";
import { searchCampaignContext } from "./search-tools";

const generateContextRecapSchema = z.object({
	campaignId: commonSchemas.campaignId,
	jwt: commonSchemas.jwt,
	sinceTimestamp: z
		.string()
		.optional()
		.describe(
			"ISO timestamp string to get data since (defaults to 1 hour ago)"
		),
});

/**
 * GM-only context recap. Full RecapService flow (session digests, world state,
 * planning tasks). Requires spoiler access. Used when the user returns to the
 * app or asks for a recap and has GM role.
 */
export const generateGMContextRecapTool = tool({
	description:
		"Generate a GM context recap for a campaign: recent activity, world state changes, session digests, and in-progress goals. Use when a game master returns to the app, switches campaigns, or asks for a recap. Returns full planning data and next-step preflight.",
	inputSchema: generateContextRecapSchema,
	execute: async (
		input: z.infer<typeof generateContextRecapSchema>,
		options: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, jwt, sinceTimestamp } = input;
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();

		try {
			if (!jwt) {
				return createToolError(
					"Authentication required",
					"JWT token is required",
					401,
					toolCallId
				);
			}

			const env = getEnvFromContext(options);
			if (!env) {
				return createToolError(
					"Environment not available",
					"Server environment is required",
					500,
					toolCallId
				);
			}

			const access = await requireCanSeeSpoilersForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if (!("userId" in access)) {
				return access;
			}
			const { userId } = access;

			const campaignAccess = await requireCampaignAccessForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in campaignAccess) {
				return campaignAccess;
			}
			const { campaign } = campaignAccess;

			const recapService = new RecapService(
				env as import("@/middleware/auth").Env
			);
			const recapData = await recapService.getContextRecap(
				campaignId,
				userId,
				sinceTimestamp
			);

			const { formatContextRecapPrompt } = await import(
				"../../lib/prompts/recap-prompts"
			);
			let recapPrompt = formatContextRecapPrompt(recapData);
			const { getPlanningTaskProgress } = await import("./planning-task-tools");
			const progressRes = (await (getPlanningTaskProgress.execute?.(
				{
					campaignId,
					jwt,
					includeStatuses: ["pending", "in_progress"],
				},
				{
					env,
					toolCallId: `${toolCallId}-preflight`,
				} as ToolExecuteOptions
			) ?? Promise.resolve(null))) as
				| { result: { success: boolean; data?: unknown } }
				| null
				| undefined;
			const progressData =
				progressRes?.result?.success && progressRes?.result?.data
					? (progressRes.result.data as {
							openTaskCount?: number;
							counts?: { completed?: number };
						})
					: null;
			const openTaskCount = progressData?.openTaskCount ?? 0;
			const completedCount = progressData?.counts?.completed ?? 0;
			if (openTaskCount > 0) {
				recapPrompt += `\n\n[Server preflight: This campaign already has ${openTaskCount} open next step(s). Call getPlanningTaskProgress to retrieve them, then present those to the user. Do NOT call recordPlanningTasks.]`;
			} else if (completedCount > 0) {
				recapPrompt += `\n\n[Server preflight: All next steps for this campaign are complete (${completedCount} completed). Your first response MUST be to ask: "Would you like me to construct a readout for your next session's plan? I'll stitch together your completion notes into a ready-to-run plan you can follow at the table—or is there something else you'd like to add first?" Do NOT suggest new next steps, World Expansion, Session Prep, or Player Engagement until the user answers. Do NOT call recordPlanningTasks.]`;
			} else {
				recapPrompt += `\n\n[Server preflight: There are no open next steps. You MUST generate 2-3 high-quality, campaign-relevant next steps (using the checklist and campaign context), then call recordPlanningTasks with them. Only after the tool succeeds may you say they have been saved and direct the user to Campaign Details > Next steps.]`;
			}

			return createToolSuccess(
				`Generated context recap for campaign "${campaign.name}"`,
				{
					campaignId,
					campaignName: campaign.name,
					recap: recapData,
					recapPrompt,
				},
				toolCallId
			);
		} catch (error) {
			console.error("[generateGMContextRecapTool] Error:", error);
			return createToolError(
				"Failed to generate context recap",
				error instanceof Error ? error.message : String(error),
				500,
				toolCallId
			);
		}
	},
});

/**
 * Player-only context recap. Returns a player-focused prompt with no GM data.
 * Requires campaign access only (no spoiler access). Used for players when they
 * return to the app or ask for a recap.
 */
export const generatePlayerContextRecapTool = tool({
	description:
		"Generate a player context recap: character-focused help and session notes without spoilers. Use when a player returns to the app, switches campaigns, or asks for a recap. Returns a player-facing prompt only; no GM planning data.",
	inputSchema: generateContextRecapSchema,
	execute: async (
		input: z.infer<typeof generateContextRecapSchema>,
		options: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, jwt } = input;
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();

		try {
			if (!jwt) {
				return createToolError(
					"Authentication required",
					"JWT token is required",
					401,
					toolCallId
				);
			}

			const env = getEnvFromContext(options);
			if (!env) {
				return createToolError(
					"Environment not available",
					"Server environment is required",
					500,
					toolCallId
				);
			}

			const campaignAccess = await requireCampaignAccessForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in campaignAccess) {
				return campaignAccess;
			}
			const { campaign } = campaignAccess;

			const playerRecapPrompt =
				"The user is a player. Greet them and offer to help with: (1) Session summary—what their character experienced and threads they remember. (2) In-character summary—one paragraph for the table (who their PC is, recent goals, emotional state). (3) Roleplay support—dialogue lines, reactions, decision beats for upcoming scenes. (4) Character notes—checklist of allies, debts, deadlines, goals. Use only information the character would reasonably know; do not reveal future plot, NPC secrets, solutions, or unrevealed content. Do not mention spoilers or permissions—just deliver the experience.";

			return createToolSuccess(
				"Player recap ready.",
				{
					campaignId,
					campaignName: campaign.name,
					recapPrompt: playerRecapPrompt,
					recap: {
						isPlayerRecap: true,
						message:
							"Offer: session summary, in-character summary for the table, roleplay support, or character notes. Ask which they want and which character to focus on.",
					},
				},
				toolCallId
			);
		} catch (error) {
			console.error("[generatePlayerContextRecapTool] Error:", error);
			return createToolError(
				"Failed to generate player context recap",
				error instanceof Error ? error.message : String(error),
				500,
				toolCallId
			);
		}
	},
});

/** @deprecated Use generateGMContextRecapTool or generatePlayerContextRecapTool. Kept for backward compatibility. */
export const generateContextRecapTool = generateGMContextRecapTool;

const getSessionReadoutContextSchema = z.object({
	campaignId: commonSchemas.campaignId,
	jwt: commonSchemas.jwt,
	forceRegenerate: z
		.boolean()
		.optional()
		.describe(
			"If true, ignore cached plan and regenerate. Use when the user requests updates to the plan."
		),
});

type SearchResultItem = { entityId?: string; text?: string; title?: string };

const ENTITY_CONTENT_MARKER =
	"ENTITY CONTENT (may contain unverified mentions):";
const MAX_READOUT_STEPS = 8;
const MAX_READOUT_ENTITIES_PER_STEP = 14;
const MAX_READOUT_ENTITY_TEXT_CHARS = 3500;

function extractTargetSessionFromTitle(title: string): number | null {
	const match = /\(\s*target\s*:\s*session\s*(\d+)\s*\)/i.exec(title);
	if (!match) return null;
	const parsed = Number.parseInt(match[1], 10);
	return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

/**
 * Strip graph-RAG metadata (relationship headers, MEMBER_OF lines, etc.) from
 * entity text so the readout contains only narrative/content for the DM.
 */
function entityContentOnly(rawText: string): string {
	const idx = rawText.indexOf(ENTITY_CONTENT_MARKER);
	if (idx < 0) return rawText;
	const after = rawText.slice(idx + ENTITY_CONTENT_MARKER.length);
	return after.replace(/^[\s\n═-]+/, "").trim();
}

/**
 * Builds readout context per completed next step: for each task, finds relevant
 * entities (search by title + completion notes), pulls full graph context
 * (traversal from those entities), and returns one blob per step so the agent
 * can transform it into a session plan. Graph-structure headers are stripped
 * so the agent receives only entity content, not "EXPLICIT ENTITY RELATIONSHIPS".
 */
export const getSessionReadoutContext = tool({
	description:
		"Get session plan readout for the upcoming session. Call when the user wants the readout (e.g. 'give me the readout', 'create the plan'). Returns a ready-to-use session plan. If a cached plan exists, returns it and prompts for updates; pass forceRegenerate: true when the user requests changes. The plan is scene-based with Description, Helpful DM Info, Dialogue, mechanics.",
	inputSchema: getSessionReadoutContextSchema,
	execute: async (
		input: z.infer<typeof getSessionReadoutContextSchema>,
		options: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, jwt, forceRegenerate } = input;
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();

		try {
			const env = getEnvFromContext(options);
			if (!env) {
				return createToolError(
					"Environment not available",
					"Server environment is required",
					500,
					toolCallId
				);
			}

			const access = await requireCanSeeSpoilersForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if (!("userId" in access)) {
				return access;
			}
			const { userId } = access;

			const campaignAccess = await requireCampaignAccessForTool({
				env,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in campaignAccess) {
				return campaignAccess;
			}
			const daoFactory = getDAOFactory(env);

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

			const planningTaskDAO = daoFactory.planningTaskDAO;
			const sessionDigestDAO = daoFactory.sessionDigestDAO;
			const sessionPlanReadoutDAO = daoFactory.sessionPlanReadoutDAO;
			const communityDAO = daoFactory.communityDAO;
			const nextSessionNumber =
				await sessionDigestDAO.getNextSessionNumber(campaignId);

			// Check cache first (unless force regenerating)
			if (!forceRegenerate) {
				const cached = await sessionPlanReadoutDAO.get(
					campaignId,
					nextSessionNumber
				);
				if (cached) {
					return createToolSuccess(
						`Cached session plan for session ${nextSessionNumber}. Present the plan to the user, then ask if anything needs to be updated.`,
						{
							plan: cached.content,
							nextSessionNumber,
							cached: true,
							promptForUpdates: true,
						},
						toolCallId
					);
				}
			}
			const allTasks = await planningTaskDAO.listByCampaign(campaignId, {
				status: ["completed"] as PlanningTaskStatus[],
			});
			const completedTasksForUpcomingSession = allTasks.filter((task) => {
				if (task.targetSessionNumber != null) {
					return task.targetSessionNumber === nextSessionNumber;
				}
				const targetFromTitle = extractTargetSessionFromTitle(task.title);
				return targetFromTitle === nextSessionNumber;
			});
			const completedTasks = [...completedTasksForUpcomingSession]
				.sort(
					(a, b) =>
						new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
				)
				.slice(-MAX_READOUT_STEPS);

			if (completedTasks.length === 0) {
				return createToolSuccess(
					`No completed next steps for upcoming session ${nextSessionNumber}; nothing to build readout from.`,
					{ steps: [], nextSessionNumber },
					toolCallId
				);
			}

			const steps: Array<{
				task: {
					id: string;
					title: string;
					completionNotes: string | null;
					createdAt: string;
				};
				instruction: string;
				readoutBlock: string;
				entityResults: Array<{ entityId: string; title: string; text: string }>;
			}> = [];

			const opts = {
				env,
				toolCallId: `${toolCallId}-step`,
			} as ToolExecuteOptions;

			for (const task of completedTasks) {
				const notesSlice = (task.completionNotes ?? "").slice(0, 400).trim();
				const queryFromTask = [task.title, notesSlice]
					.filter(Boolean)
					.join(" ")
					.trim();
				const searchQuery = queryFromTask || task.title;

				const searchArgs = {
					campaignId,
					jwt,
					searchOriginalFiles: false,
					includeTraversedEntities: true,
					offset: 0,
					limit: 50,
					forSessionReadout: true,
				};

				const searchRes = (await searchCampaignContext.execute?.(
					{ ...searchArgs, query: searchQuery },
					opts
				)) as
					| {
							result: {
								success: boolean;
								data?: { results?: SearchResultItem[] };
							};
					  }
					| undefined;

				const initialResults: SearchResultItem[] =
					searchRes?.result?.success && searchRes?.result?.data?.results
						? searchRes.result.data.results
						: [];

				if (notesSlice && notesSlice.length > 80) {
					const notesOnlyRes = (await searchCampaignContext.execute?.(
						{ ...searchArgs, query: notesSlice },
						opts
					)) as
						| {
								result: {
									success: boolean;
									data?: { results?: SearchResultItem[] };
								};
						  }
						| undefined;
					const notesResults =
						notesOnlyRes?.result?.success && notesOnlyRes?.result?.data?.results
							? notesOnlyRes.result.data.results
							: [];
					const seenIds = new Set(
						initialResults.map((r) => r.entityId).filter(Boolean)
					);
					for (const r of notesResults) {
						if (r.entityId && !seenIds.has(r.entityId)) {
							seenIds.add(r.entityId);
							initialResults.push(r);
						}
					}
				}

				const entityIds = initialResults
					.map((r) => r.entityId)
					.filter((id): id is string => Boolean(id));

				let traversedResults: SearchResultItem[] = [];
				if (entityIds.length > 0) {
					const traverseRes = (await searchCampaignContext.execute?.(
						{
							campaignId,
							jwt,
							query: task.title,
							searchOriginalFiles: false,
							traverseFromEntityIds: entityIds,
							traverseDepth: 2,
							includeTraversedEntities: true,
							offset: 0,
							limit: 50,
							forSessionReadout: true,
						},
						opts
					)) as
						| {
								result: {
									success: boolean;
									data?: { results?: SearchResultItem[] };
								};
						  }
						| undefined;
					traversedResults =
						traverseRes?.result?.success && traverseRes?.result?.data?.results
							? traverseRes.result.data.results
							: [];
				}

				const byId = new Map<string, { title: string; text: string }>();
				for (const r of initialResults) {
					if (r.entityId && r.text != null) {
						byId.set(r.entityId, {
							title: r.title ?? r.entityId,
							text: entityContentOnly(r.text),
						});
					}
				}
				for (const r of traversedResults) {
					if (r.entityId && r.text != null && !byId.has(r.entityId)) {
						byId.set(r.entityId, {
							title: r.title ?? r.entityId,
							text: entityContentOnly(r.text),
						});
					}
				}

				const entityResults = Array.from(byId.entries())
					.slice(0, MAX_READOUT_ENTITIES_PER_STEP)
					.map(([entityId, v]) => ({
						entityId,
						title: v.title,
						text:
							v.text.length > MAX_READOUT_ENTITY_TEXT_CHARS
								? `${v.text.slice(0, MAX_READOUT_ENTITY_TEXT_CHARS)}\n\n[truncated for readout context size]`
								: v.text,
					}));

				// Debug logging: which entities and communities are feeding this step's readout.
				// This helps inspect which data points are actually being used when
				// constructing the session plan.
				const communitiesByEntity: Record<
					string,
					{ id: string; level: number; entityCount: number }[]
				> = {};

				for (const entity of entityResults) {
					try {
						const communities =
							await communityDAO.findCommunitiesContainingEntity(
								campaignId,
								entity.entityId
							);
						if (communities.length > 0) {
							communitiesByEntity[entity.entityId] = communities.map((c) => ({
								id: c.id,
								level: c.level,
								entityCount: c.entityIds.length,
							}));
						}
					} catch (communityError) {
						console.warn(
							"[getSessionReadoutContext] Failed to load communities for entity",
							entity.entityId,
							communityError
						);
					}
				}

				console.log("[getSessionReadoutContext] Step context summary", {
					campaignId,
					taskId: task.id,
					taskTitle: task.title,
					entityResults: entityResults.map((e) => ({
						entityId: e.entityId,
						title: e.title,
					})),
					communitiesByEntity,
				});

				const readoutBlock = [
					`## ${task.title}`,
					"",
					...entityResults.flatMap((e) => [`### ${e.title}`, "", e.text, ""]),
				].join("\n");

				steps.push({
					task: {
						id: task.id,
						title: task.title,
						completionNotes: task.completionNotes,
						createdAt: task.createdAt,
					},
					instruction:
						"Transform the readoutBlock below into part of a session plan for the DM. Use the full entity content (Background, Character Traits, Emotional Stakes, NPC Reactions, mechanics, etc.) but present it as a scene or encounter in the plan: Description, Helpful DM Info, Dialogue, player options. Do not expose graph structure or relationship metadata. Output should read like a session script outline the DM can run at the table—not a raw dump of entity data. Include all substantive detail from the readoutBlock.",
					readoutBlock,
					entityResults,
				});
			}

			// Generate session plan via LLM and persist
			const providerEnvVar =
				MODEL_CONFIG.PROVIDER.DEFAULT === "anthropic"
					? "ANTHROPIC_API_KEY"
					: "OPENAI_API_KEY";
			const providerApiKeyRaw = await getEnvVar(
				env as unknown as Record<string, unknown>,
				providerEnvVar,
				false
			);
			const providerApiKey = providerApiKeyRaw?.trim() ?? "";
			if (!providerApiKey) {
				return createToolError(
					`${MODEL_CONFIG.PROVIDER.DEFAULT === "anthropic" ? "Anthropic" : "OpenAI"} API key not configured`,
					"AI is not configured for this environment.",
					503,
					toolCallId
				);
			}

			const { formatSessionPlanReadoutPrompt } = await import(
				"../../lib/prompts/recap-prompts"
			);
			const { createLLMProvider } = await import(
				"../../services/llm/llm-provider-factory"
			);
			const { getGenerationModelForProvider } = await import(
				"../../app-constants"
			);

			const prompt = formatSessionPlanReadoutPrompt(steps, nextSessionNumber);
			const llmProvider = createLLMProvider({
				provider: MODEL_CONFIG.PROVIDER.DEFAULT,
				apiKey: providerApiKey,
				defaultModel: getGenerationModelForProvider("SESSION_PLANNING"),
				defaultTemperature:
					MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_TEMPERATURE,
				defaultMaxTokens: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_MAX_TOKENS,
			});

			console.log(
				"[getSessionReadoutContext] Generating session plan with LLM..."
			);
			const transformedPlan = await llmProvider.generateSummary(prompt, {
				model: getGenerationModelForProvider("SESSION_PLANNING"),
				temperature: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_TEMPERATURE,
				maxTokens: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_MAX_TOKENS,
			});

			await sessionPlanReadoutDAO.save(
				campaignId,
				nextSessionNumber,
				transformedPlan
			);

			return createToolSuccess(
				`Session plan generated for session ${nextSessionNumber}. Present the plan to the user. It has been saved for future requests.`,
				{
					plan: transformedPlan,
					nextSessionNumber,
					cached: false,
				},
				toolCallId
			);
		} catch (error) {
			console.error("[getSessionReadoutContext] Error:", error);
			return createToolError(
				"Failed to get session readout context",
				error instanceof Error ? error.message : String(error),
				500,
				toolCallId
			);
		}
	},
});
