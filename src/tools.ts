/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool } from "ai";
import { z } from "zod";

import type { Chat } from "./server";
import { getCurrentAgent } from "agents";
import { unstable_scheduleSchema } from "agents/schedule";

/**
 * Weather information tool that requires human confirmation
 * When invoked, this will present a confirmation dialog to the user
 * The actual implementation is in the executions object below
 */
const getWeatherInformation = tool({
  description: "show the weather in a given city to the user",
  parameters: z.object({ city: z.string() }),
  // Omitting execute function makes this tool require human confirmation
});

/**
 * Local time tool that executes automatically
 * Since it includes an execute function, it will run without user confirmation
 * This is suitable for low-risk operations that don't need oversight
 */
const getLocalTime = tool({
  description: "get the local time for a specified location",
  parameters: z.object({ location: z.string() }),
  execute: async ({ location }) => {
    console.log(`Getting local time for ${location}`);
    return "10am";
  },
});

/**
 * Tool to set admin secret for PDF upload functionality
 * This validates the provided admin key and stores it in the session
 */
const setAdminSecret = tool({
  description: "Validate and store the admin key for PDF upload functionality",
  parameters: z.object({ 
    adminKey: z.string().describe("The admin key provided by the user") 
  }),
  execute: async ({ adminKey }) => {
    try {
      // Get the current agent to access session ID
      const { agent } = getCurrentAgent<Chat>();
      const sessionId = agent?.name || "default-session";
      
      // Make HTTP request to the authenticate endpoint which uses the environment variable
      const apiBaseUrl = process.env.VITE_API_URL || "http://localhost:8787";
      const response = await fetch(`${apiBaseUrl}/pdf/authenticate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          providedKey: adminKey
        })
      });

      const result = await response.json() as { success: boolean; authenticated: boolean; error?: string };
      
      if (result.success && result.authenticated) {
        return `✅ Admin key validated successfully! You now have access to PDF upload and parsing features. Please go ahead and upload your PDF file.`;
      } else {
        return `❌ Invalid admin key. Please check your key and try again.`;
      }
    } catch (error) {
      console.error("Error validating admin key:", error);
      return `❌ Error validating admin key: ${error}`;
    }
  },
});

/**
 * Tool to check PDF upload authentication status
 * This allows the agent to check if the current session is authenticated for PDF operations
 */
const checkPdfAuthStatus = tool({
  description: "Check if the current session is authenticated for PDF upload operations",
  parameters: z.object({}),
  execute: async () => {
    try {
      const { agent } = getCurrentAgent<Chat>();
      const sessionId = agent?.name || "default-session";
      
      // For now, return a simple response
      // In a real implementation, you'd check the Durable Object
      return `✅ Session is authenticated for PDF operations. You can upload PDF files.`;
    } catch (error) {
      console.error("Error checking PDF auth status:", error);
      return `❌ Error checking authentication status: ${error}`;
    }
  },
});

/**
 * Tool to list uploaded PDF files
 * This allows the agent to show the user what PDFs have been uploaded
 */
const listPdfFiles = tool({
  description: "List all PDF files that have been uploaded in the current session",
  parameters: z.object({}),
  execute: async () => {
    try {
      const { agent } = getCurrentAgent<Chat>();
      const sessionId = agent?.name || "default-session";
      
      // For now, return a simple response
      // In a real implementation, you'd query the Durable Object
      return `📄 No PDF files have been uploaded yet.`;
    } catch (error) {
      console.error("Error listing PDF files:", error);
      return `❌ Error retrieving PDF files: ${error}`;
    }
  },
});

/**
 * Tool to get PDF upload statistics
 * This allows the agent to show upload statistics to the user
 */
const getPdfStats = tool({
  description: "Get statistics about PDF uploads and processing",
  parameters: z.object({}),
  execute: async () => {
    try {
      // For now, return basic stats structure since we don't have aggregation across sessions
      return `📊 PDF Upload Statistics:
- Total Sessions: 1 (current session)
- Total Files: Check with "list my PDF files" command
- Note: Statistics are per-session only`;
    } catch (error) {
      console.error("Error getting PDF stats:", error);
      return `❌ Error retrieving PDF statistics: ${error}`;
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
  getWeatherInformation,
  getLocalTime,
  setAdminSecret,
  checkPdfAuthStatus,
  listPdfFiles,
  getPdfStats,
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
  getWeatherInformation: async ({ city }: { city: string }) => {
    console.log(`Getting weather information for ${city}`);
    return `The weather in ${city} is sunny`;
  },
};
