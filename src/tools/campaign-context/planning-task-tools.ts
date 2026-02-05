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

      if (replaceExisting) {
        await planningTaskDAO.markSupersededForCampaign(campaignId);
      }

      const created = await planningTaskDAO.bulkCreatePlanningTasks(
        campaignId,
        tasks.map((t) => ({
          title: t.title,
          description: t.description ?? null,
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
    'Get planning task ("next steps") progress for a campaign, including counts by status and the list of tasks. Use this before suggesting new next steps so you can reference what the user has already completed or is working on.',
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

      const tasks = await planningTaskDAO.listByCampaign(campaignId, {
        status: statusesToInclude,
      });

      const counts: Record<PlanningTaskStatus, number> = {
        pending: 0,
        in_progress: 0,
        completed: 0,
        superseded: 0,
      };
      for (const task of tasks) {
        counts[task.status] += 1;
      }
      const openTaskCount = counts.pending + counts.in_progress;

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
