/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */

import { tool } from "ai";
import { z } from "zod";

import type { Message } from "@ai-sdk/react";
import { getCurrentAgent } from "agents";
import { unstable_scheduleSchema } from "agents/schedule";
import type { Chat } from "./server";
import { pdfTools } from "./tools/pdf-tools";

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
 * Generic tool result processing utilities
 * These functions can be reused across different tool types
 */

export interface ToolResult {
  // Required properties
  code: string;
  message: string;
  status: "SUCCESS" | "ERROR" | "FAILED";

  // Optional properties
  secret?: string | null;
  suppressFollowUp?: boolean;
}

/**
 * Parse tool result from JSON string
 */
export function parseToolResult(result: string): ToolResult | null {
  try {
    const parsed = JSON.parse(result);
    return parsed as ToolResult;
  } catch (error) {
    console.warn("Failed to parse tool result as JSON:", error);
    return null;
  }
}

/**
 * Extract admin secret from setAdminSecret tool result
 */
export function extractAdminSecretFromToolResult(
  messages: Message[]
): string | null {
  for (const message of messages) {
    if (message.parts) {
      for (const part of message.parts) {
        if (
          part.type === "tool-invocation" &&
          part.toolInvocation?.toolName === "setAdminSecret" &&
          part.toolInvocation?.state === "result"
        ) {
          const result = part.toolInvocation?.result;
          const parsedResult = parseToolResult(result);

          if (parsedResult?.status === "SUCCESS" && parsedResult?.secret) {
            return parsedResult.secret;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Check if a tool is an admin secret tool
 */
export function isAdminSecretTool(toolName: string): boolean {
  return toolName === "requestAdminSecret" || toolName === "setAdminSecret";
}

/**
 * Format tool result for display
 * This function handles formatting of tool results for display in the UI
 */
export function formatToolResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  if (typeof result === "object" && result !== null) {
    // Handle JSON stringified results (common for admin secret tools)
    if ("status" in result && "message" in result) {
      const typedResult = result as { status: string; message: string };
      return typedResult.message;
    }

    // Handle other object results
    return JSON.stringify(result, null, 2);
  }

  return String(result);
}

/**
 * Check if a tool result should suppress follow-up messages
 */
export function shouldSuppressFollowUp(toolResult: string): boolean {
  const parsed = parseToolResult(toolResult);
  return parsed?.suppressFollowUp === true;
}

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  ...pdfTools,
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
  deletePdfFile: pdfTools.deletePdfFile.execute,
};
