/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */

import { getCurrentAgent } from "agents";
import { unstable_scheduleSchema } from "agents/schedule";
import { tool } from "ai";
import { z } from "zod";
import type { Chat } from "../server";

// Campaign-related tools
import { campaignTools as importedCampaignTools } from "./campaignTools";
// PDF-related tools have been moved to ./tools/pdfTools.ts
import { pdfTools as importedPdfTools } from "./pdfTools";

console.log("DEBUG importedCampaignTools:", importedCampaignTools);
console.log("DEBUG createCampaign tool:", importedCampaignTools.createCampaign);
console.log(
  "DEBUG createCampaign.description:",
  importedCampaignTools.createCampaign.description
);
console.log(
  "DEBUG createCampaign.parameters:",
  importedCampaignTools.createCampaign.parameters
);

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
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask,
  ...importedPdfTools,
  ...importedCampaignTools,
};

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 * NOTE: keys below should match toolsRequiringConfirmation in app.tsx
 */
// Import the proper type for tool execution
import type { ToolExecutionOptions } from "ai";

export const executions = {
  createCampaign: async (params: { name: string; jwt?: string }) => {
    const { campaignTools } = await import("./campaignTools");
    return campaignTools.createCampaign.execute(
      params,
      {} as ToolExecutionOptions
    );
  },
  listCampaignResources: async (params: {
    campaignId: string;
    jwt?: string;
  }) => {
    const { campaignTools } = await import("./campaignTools");
    return campaignTools.listCampaignResources.execute(
      params,
      {} as ToolExecutionOptions
    );
  },
  addResourceToCampaign: async (params: {
    campaignId: string;
    resourceType: "pdf" | "character" | "note" | "image";
    resourceId: string;
    resourceName?: string;
    jwt?: string;
  }) => {
    const { campaignTools } = await import("./campaignTools");
    return campaignTools.addResourceToCampaign.execute(
      params,
      {} as ToolExecutionOptions
    );
  },
  showCampaignDetails: async (params: { campaignId: string; jwt?: string }) => {
    const { campaignTools } = await import("./campaignTools");
    return campaignTools.showCampaignDetails.execute(
      params,
      {} as ToolExecutionOptions
    );
  },
};
