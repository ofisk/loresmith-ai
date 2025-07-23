import type { D1Database } from "@cloudflare/workers-types";
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
  DB: D1Database;
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

const GENERAL_SYSTEM_PROMPT = `You are a General AI assistant specialized in handling scheduling and utility operations.

${unstable_getSchedulePrompt({ date: new Date() })}

### CRITICAL RULE ###
Use tools when users want to schedule, view, or cancel tasks. Provide direct responses for general conversation or when no action is needed.

### TOOL MAPPING ###
"schedule a task" → USE scheduleTask tool
"show scheduled tasks" → USE getScheduledTasks tool
"list my tasks" → USE getScheduledTasks tool
"cancel task" → USE cancelScheduledTask tool

### AVAILABLE TOOLS ###
- scheduleTask: Schedule a task to be executed at a specific time
- getScheduledTasks: Get all scheduled tasks
- cancelScheduledTask: Cancel a scheduled task by its ID

### EXECUTION RULES ###
1. Use tools ONLY when users explicitly want to schedule, view, or cancel tasks
2. Provide direct, helpful responses for general conversation
3. If a user's message doesn't relate to scheduling, respond directly without using tools
4. When using tools, provide a clear response based on the tool result

### RESPONSE FORMAT ###
- For scheduling requests: Use the appropriate tool and explain the result
- For general conversation: Respond directly and helpfully
- Always be clear about what happened and what the user can do next

### SPECIALIZATION ###
You are ONLY responsible for scheduling and general utility operations. If users ask about campaigns, PDF files, or other specific topics, politely redirect them to the appropriate agent:
- For campaign management: Use the CampaignsAgent
- For PDF and resource management: Use the ResourceAgent

### TASK SCHEDULING ###
Help users schedule tasks by:
1. Understanding what they want to schedule
2. Getting the desired execution time
3. Using scheduleTask to create the scheduled task
4. Confirming the task was scheduled successfully
5. Providing a clear response about what was scheduled`;

/**
 * General Agent implementation that handles scheduling and general utility operations
 */
export class GeneralAgent extends BaseAgent {
  constructor(ctx: DurableObjectState, env: Env, model: any) {
    super(ctx, env, model, generalTools, GENERAL_SYSTEM_PROMPT);
  }
}
