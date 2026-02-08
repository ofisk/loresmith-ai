import { tool } from "ai";
import { z } from "zod";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  getEnvFromContext,
  type ToolExecuteOptions,
} from "../utils";
import type { ToolResult } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import type { PlanningTaskStatus } from "@/dao/planning-task-dao";
import { notifyNextStepsCreated } from "@/lib/notifications";
import type { Env } from "@/middleware/auth";

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

      const planningTaskDAO = daoFactory.planningTaskDAO;
      const sessionDigestDAO = daoFactory.sessionDigestDAO;

      if (replaceExisting) {
        await planningTaskDAO.markSupersededForCampaign(campaignId);
      }

      const nextSessionNumber =
        await sessionDigestDAO.getNextSessionNumber(campaignId);

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
        `Recorded ${created.length} planning task(s) for campaign "${campaign.name}".`,
        {
          tasks: created,
        },
        toolCallId
      );
    } catch (error) {
      console.error("[recordPlanningTasks] Error:", error);
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
});

export const getPlanningTaskProgress = tool({
  description:
    'Get planning task ("next steps") progress for a campaign, including counts by status and the list of tasks. Completed tasks include completionNotes (how the user completed the step). For "summarize my completed steps" or "what was my solution?", call with includeStatuses including "completed" to get completionNotes.',
  inputSchema: getPlanningTaskProgressSchema,
  execute: async (
    input: z.infer<typeof getPlanningTaskProgressSchema>,
    options?: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, jwt, includeStatuses } = input;
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

      const planningTaskDAO = daoFactory.planningTaskDAO;

      const statusesToInclude: PlanningTaskStatus[] = (includeStatuses as
        | PlanningTaskStatus[]
        | undefined) ?? ["pending", "in_progress"];

      const allTasks = await planningTaskDAO.listByCampaign(campaignId, {});

      const counts: Record<PlanningTaskStatus, number> = {
        pending: 0,
        in_progress: 0,
        completed: 0,
        superseded: 0,
      };
      for (const task of allTasks) {
        counts[task.status] += 1;
      }
      const openTaskCount = counts.pending + counts.in_progress;

      const tasks = allTasks.filter((t) =>
        statusesToInclude.includes(t.status)
      );

      return createToolSuccess(
        `Retrieved planning task progress for campaign "${campaign.name}".`,
        {
          tasks,
          counts,
          openTaskCount,
        },
        toolCallId
      );
    } catch (error) {
      console.error("[getPlanningTaskProgress] Error:", error);
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
      "Brief summary of how the user completed this step (from their messages). Saved so the user can recap completed steps and combine them into a session plan later."
    ),
});

export const completePlanningTask = tool({
  description:
    "Mark a planning task (next step) as completed. Use this only after the user has confirmed they want to mark the step done. Always pass completionNotes: a brief summary of how the user completed this step (from their messages) so they can recap later. Call when the user explicitly confirms (e.g. 'yes', 'mark it done').",
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

      const planningTaskDAO = daoFactory.planningTaskDAO;
      await planningTaskDAO.updateStatus(
        planningTaskId,
        "completed",
        linkedShardId ?? null,
        completionNotes ?? null
      );

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
      console.error("[completePlanningTask] Error:", error);
      return createToolError(
        "Failed to complete planning task",
        error,
        500,
        toolCallId
      );
    }
  },
});
