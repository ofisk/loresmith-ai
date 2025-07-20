/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */

import { getCurrentAgent } from "agents";
import { unstable_scheduleSchema } from "agents/schedule";
import { tool } from "ai";
import { z } from "zod";
import {
  API_CONFIG,
  AUTH_CODES,
  type ToolResult,
  USER_MESSAGES,
} from "../constants";
import type { Chat } from "../server";

/**
 * Tool to set admin secret for PDF upload functionality
 * This validates the provided admin key and stores it in the session
 */
const setAdminSecret = tool({
  description: "Validate and store the admin key for PDF upload functionality",
  parameters: z.object({
    adminKey: z.string().describe("The admin key provided by the user"),
    username: z.string().describe("The username provided by the user"),
  }),
  execute: async ({ adminKey, username }): Promise<ToolResult> => {
    try {
      // Make HTTP request to the authenticate endpoint using centralized API config
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.AUTHENTICATE),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            providedKey: adminKey,
            username,
          }),
        }
      );

      const result = (await response.json()) as {
        success: boolean;
        authenticated: boolean;
        error?: string;
        token?: string;
      };

      if (result.success && result.authenticated) {
        return {
          code: AUTH_CODES.SUCCESS,
          message: USER_MESSAGES.ADMIN_KEY_VALIDATED,
          data: { authenticated: true, token: result.token },
        };
      }
      return {
        code: AUTH_CODES.INVALID_KEY,
        message: USER_MESSAGES.INVALID_ADMIN_KEY,
        data: { authenticated: false },
      };
    } catch (error) {
      console.error("Error validating admin key:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error validating admin key: ${error}`,
        data: { authenticated: false },
      };
    }
  },
});

const scheduleTask = tool({
  description: "A tool to schedule a task to be executed at a later time",
  parameters: unstable_scheduleSchema,
  execute: async ({ when, description }) => {
    // we can now read the agent context from the ALS store
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
      agent!.schedule(input!, "executeTask", description);
    } catch (error) {
      console.error("error scheduling task", error);
      return `Error scheduling task: ${error}`;
    }
    return `Task scheduled for type "${when.type}" : ${input}`;
  },
});

/**
 * Tool to list all scheduled tasks
 * This executes automatically without requiring human confirmation
 */
const getScheduledTasks = tool({
  description: "List all tasks that have been scheduled",
  parameters: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const tasks = agent!.getSchedules();
      if (!tasks || tasks.length === 0) {
        return "No scheduled tasks found.";
      }
      return tasks;
    } catch (error) {
      console.error("Error listing scheduled tasks", error);
      return `Error listing scheduled tasks: ${error}`;
    }
  },
});

/**
 * Tool to cancel a scheduled task by its ID
 * This executes automatically without requiring human confirmation
 */
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

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  setAdminSecret,
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask,
};

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 * NOTE: keys below should match toolsRequiringConfirmation in app.tsx
 */
export const executions = {
  // ... existing code ...
};
