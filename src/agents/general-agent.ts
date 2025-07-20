import { getCurrentAgent } from "agents";
import {
  unstable_getSchedulePrompt,
  unstable_scheduleSchema,
} from "agents/schedule";
import { tool } from "ai";
import { z } from "zod";
import type { Chat } from "../server";
import { BaseAgent } from "./base-agent";

interface Env {
  ADMIN_SECRET?: string;
  PDF_BUCKET: R2Bucket;
  Chat: DurableObjectNamespace;
  UserFileTracker: DurableObjectNamespace;
  CampaignManager: DurableObjectNamespace;
}

const scheduleTask = tool({
  description: "Schedule a task to be executed at a specific time",
  parameters: unstable_scheduleSchema,
  execute: async ({ when, description }) => {
    const { agent } = getCurrentAgent<Chat>();

    function throwError(msg: string): string {
      throw new Error(msg);
    }
    if (when.type === "no-schedule") {
      return "Not a valid schedule input";
    }
    const input =
      when.type === "scheduled"
        ? when.date // scheduled
        : when.type === "delayed"
          ? when.delayInSeconds // delayed
          : when.type === "cron"
            ? when.cron // cron
            : throwError("not a valid schedule input");
    try {
      const taskId = await agent!.schedule(input!, "executeTask", description);
      return `Task scheduled successfully with ID: ${taskId}`;
    } catch (error) {
      console.error("Error scheduling task", error);
      return `Error scheduling task: ${error}`;
    }
  },
});

const getScheduledTasks = tool({
  description: "Get all scheduled tasks",
  parameters: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      const tasks = await agent!.getSchedules();
      return `Scheduled tasks: ${JSON.stringify(tasks, null, 2)}`;
    } catch (error) {
      console.error("Error getting scheduled tasks", error);
      return `Error getting scheduled tasks: ${error}`;
    }
  },
});

const cancelScheduledTask = tool({
  description: "Cancel a scheduled task using its ID",
  parameters: z.object({
    taskId: z.string().describe("The ID of the task to cancel"),
  }),
  execute: async ({ taskId }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      await agent!.cancelSchedule(taskId);
      return `Task ${taskId} has been successfully canceled.`;
    } catch (error) {
      console.error("Error canceling scheduled task", error);
      return `Error canceling task ${taskId}: ${error}`;
    }
  },
});

const generalTools = {
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask,
};

const GENERAL_SYSTEM_PROMPT = `You are a General AI assistant specialized in handling scheduling and utility operations. You MUST use tools to help users with general tasks.

${unstable_getSchedulePrompt({ date: new Date() })}

**CRITICAL INSTRUCTIONS:**
- When users ask to schedule tasks, call the scheduleTask tool
- When users ask about scheduled tasks, call the getScheduledTasks tool
- When users ask to cancel tasks, call the cancelScheduledTask tool
- ALWAYS use tools instead of just responding with text

**Available General Tools:**
- scheduleTask: Schedule a task to be executed at a specific time
- getScheduledTasks: Get all scheduled tasks
- cancelScheduledTask: Cancel a scheduled task by its ID

**General Commands:**
- "schedule a task" → Call scheduleTask
- "show scheduled tasks" → Call getScheduledTasks
- "list my tasks" → Call getScheduledTasks
- "cancel task" → Call cancelScheduledTask

**IMPORTANT:** You have general utility tools available. Use them. Do not just respond with text when tools are available.

**Specialization:** You are ONLY responsible for scheduling and general utility operations. If users ask about campaigns, PDF files, or other specific topics, politely redirect them to the appropriate agent:
- For campaign management: Use the CampaignsAgent
- For PDF and resource management: Use the ResourceAgent

**Task Scheduling:** Help users schedule tasks by:
1. Understanding what they want to schedule
2. Getting the desired execution time
3. Using scheduleTask to create the scheduled task
4. Confirming the task was scheduled successfully`;

/**
 * General Agent implementation that handles scheduling and general utility operations
 */
export class GeneralAgent extends BaseAgent {
  constructor(ctx: DurableObjectState, env: Env, model: any) {
    super(ctx, env, model, generalTools, GENERAL_SYSTEM_PROMPT);
  }
}
