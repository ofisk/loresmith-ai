import { tool } from "ai";
import { z } from "zod";
import type { ToolResult } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import type { PlanningTaskStatus } from "@/dao/planning-task-dao";
import { notifyNextStepsCreated } from "@/lib/notifications";
import {
	countTasksByStatus,
	filterTasksForSessionNumber,
	filterTasksForUpcomingSession,
} from "@/lib/planning-task-session";
import type { Env } from "@/middleware/auth";
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

const planningTaskSchema = z.object({
	title: z
		.string()
		.min(1, "Title is required")
		.describe(
			"Short, actionable task title (e.g. 'Prepare a key NPC's motivations')"
		),
	description: z
		.string()
		.optional()
		.describe("Optional longer description or notes for this task"),
});

const recordPlanningTasksSchema = z.object({
	campaignId: commonSchemas.campaignId,
	jwt: commonSchemas.jwt,
	tasks: z
		.array(planningTaskSchema)
		.min(1, "At least one planning task is required"),
	sourceMessageId: z
		.string()
		.optional()
		.describe(
			"Optional message id that these tasks originated from (for traceability)"
		),
	replaceExisting: z
		.boolean()
		.optional()
		.describe(
			"If true, supersede existing pending/in_progress tasks for this campaign before recording the new ones."
		),
});

export const recordPlanningTasks = tool({
	description:
		"Record planning tasks (\"next steps\") for a campaign so they can be tracked over time. Use this when you provide concrete, actionable next steps such as 'Prepare a key NPC's character and motivations' or 'Sketch the starting location map'.",
	inputSchema: recordPlanningTasksSchema,
	execute: async (
		input: z.infer<typeof recordPlanningTasksSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, jwt, tasks, sourceMessageId, replaceExisting } = input;
		const toolCallId = options?.toolCallId ?? "unknown";

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
			if ("toolCallId" in campaignAccess) return campaignAccess;
			const { campaign } = campaignAccess;

			const daoFactory = getDAOFactory(env);

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

			const planningTaskDAO = daoFactory.planningTaskDAO;
			const sessionDigestDAO = daoFactory.sessionDigestDAO;

			const nextSessionNumber =
				await sessionDigestDAO.getNextSessionNumber(campaignId);

			if (replaceExisting) {
				await planningTaskDAO.markSupersededForCampaignSession(
					campaignId,
					nextSessionNumber
				);
			}

			const created = await planningTaskDAO.bulkCreatePlanningTasks(
				campaignId,
				tasks.map((t) => ({
					title: t.title,
					description: t.description ?? null,
					targetSessionNumber: nextSessionNumber,
				})),
				sourceMessageId
			);

			if (created.length > 0 && env && "NOTIFICATIONS" in env) {
				await notifyNextStepsCreated(
					env as Env,
					userId,
					campaign.name,
					created.length
				);
			}

			return createToolSuccess(
				`Recorded ${created.length} planning task(s) for session ${nextSessionNumber}.`,
				{
					tasks: created,
					nextSessionNumber,
					targetSessionNumber: nextSessionNumber,
				},
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to record planning tasks",
				error,
				500,
				toolCallId
			);
		}
	},
});

const getPlanningTaskProgressSchema = z.object({
	campaignId: commonSchemas.campaignId,
	jwt: commonSchemas.jwt,
	includeStatuses: z
		.array(
			z
				.string()
				.describe("Planning task status")
				.refine(
					(val): val is PlanningTaskStatus =>
						["pending", "in_progress", "completed", "superseded"].includes(val),
					{
						message: "Invalid planning task status",
					}
				)
		)
		.optional()
		.describe(
			"Optional list of statuses to include. Defaults to pending and in_progress."
		),
	targetSessionNumber: z
		.number()
		.int()
		.min(1)
		.optional()
		.describe(
			"Filter to tasks pinned to this session. Omit to use the upcoming session (next session to play)."
		),
});

export const getPlanningTaskProgress = tool({
	description:
		'Get planning task ("next steps") progress for a campaign. By default scopes to the upcoming session (tasks pinned with targetSessionNumber = next session to play). Returns nextSessionNumber, counts, openTaskCount, and tasks. Completed tasks include completionNotes. For retroactive review of a past session, pass targetSessionNumber. For "summarize my completed steps" for the upcoming session readout, call with includeStatuses including "completed" (defaults to upcoming session scope).',
	inputSchema: getPlanningTaskProgressSchema,
	execute: async (
		input: z.infer<typeof getPlanningTaskProgressSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, jwt, includeStatuses, targetSessionNumber } = input;
		const toolCallId = options?.toolCallId ?? "unknown";

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
			if ("toolCallId" in campaignAccess) return campaignAccess;
			const { campaign } = campaignAccess;

			const daoFactory = getDAOFactory(env);

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

			const planningTaskDAO = daoFactory.planningTaskDAO;
			const sessionDigestDAO = daoFactory.sessionDigestDAO;

			const nextSessionNumber =
				await sessionDigestDAO.getNextSessionNumber(campaignId);
			const sessionScope =
				targetSessionNumber != null ? targetSessionNumber : nextSessionNumber;

			const statusesToInclude: PlanningTaskStatus[] = (includeStatuses as
				| PlanningTaskStatus[]
				| undefined) ?? ["pending", "in_progress"];

			const allTasks = await planningTaskDAO.listByCampaign(campaignId, {});

			const scopedTasks =
				targetSessionNumber != null
					? filterTasksForSessionNumber(allTasks, sessionScope)
					: filterTasksForUpcomingSession(allTasks, nextSessionNumber);

			const counts = countTasksByStatus(scopedTasks);
			const openTaskCount = counts.pending + counts.in_progress;

			const tasks = scopedTasks.filter((t) =>
				statusesToInclude.includes(t.status)
			);

			return createToolSuccess(
				`Retrieved planning task progress for campaign "${campaign.name}" (session ${sessionScope}).`,
				{
					tasks,
					counts,
					openTaskCount,
					nextSessionNumber,
					targetSessionNumber: sessionScope,
				},
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to get planning task progress",
				error,
				500,
				toolCallId
			);
		}
	},
});

const completePlanningTaskSchema = z.object({
	campaignId: commonSchemas.campaignId,
	planningTaskId: z
		.string()
		.uuid()
		.describe("The id of the planning task to mark as completed"),
	jwt: commonSchemas.jwt,
	linkedShardId: z
		.string()
		.uuid()
		.optional()
		.describe(
			"Optional id of a note/shard that was created from captured context for this task"
		),
	completionNotes: z
		.string()
		.optional()
		.describe(
			"Comprehensive notes for how the user completed this step: include all planning detail from the conversation (NPCs, locations, beats, dialogue, consequences, etc.). Saved for the session plan readout—do not summarize; capture as much as the user provided so the DM has full detail later."
		),
});

export const completePlanningTask = tool({
	description:
		"Mark a planning task (next step) as completed. Call when user content clearly satisfies the task's constraints—automatically after capturing with captureConversationalContext, or when the user explicitly confirms. Always pass completionNotes: comprehensive notes capturing how the user completed this step (include all planning detail from their messages, not a short summary). When one capture fulfills multiple tasks, call this for each task with the shared completionNotes and linkedShardId if a shard was created.",
	inputSchema: completePlanningTaskSchema,
	execute: async (
		input: z.infer<typeof completePlanningTaskSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, planningTaskId, jwt, linkedShardId, completionNotes } =
			input;
		const toolCallId = options?.toolCallId ?? "unknown";

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
			if ("toolCallId" in campaignAccess) return campaignAccess;

			const daoFactory = getDAOFactory(env);

			const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
			if (gmError) return gmError;

			const planningTaskDAO = daoFactory.planningTaskDAO;
			await planningTaskDAO.updateStatus(
				planningTaskId,
				"completed",
				linkedShardId ?? null,
				completionNotes ?? null
			);

			await daoFactory.sessionPlanReadoutDAO.invalidateForCampaign(campaignId);

			return createToolSuccess(
				"Planning step marked as complete. The user can review in Campaign details > Next steps.",
				{
					planningTaskId,
					status: "completed",
					completionNotes: completionNotes ?? undefined,
				},
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to complete planning task",
				error,
				500,
				toolCallId
			);
		}
	},
});
