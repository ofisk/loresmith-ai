/**
 * Tool definitions for the AI chat agent
 *
 * This module exports all available tools for the AI model to use.
 * Tools can either require human confirmation or execute automatically.
 *
 * Tool Categories:
 * - Campaign Management: Create, list, and manage campaigns
 * - PDF Processing: Upload, list, and process PDF files
 * - General Utilities: Authentication and system tools
 */

// Campaign-related tools
import { campaignTools as importedCampaignTools } from "./campaign";
// General tools for authentication and utilities
import { generalTools } from "./general";
// PDF-related tools for file management
import { pdfTools as importedPdfTools } from "./pdf";
// Session planning-related tools
import { sessionPlanningTools as importedSessionPlanningTools } from "./session-planning";

/**
 * Export all available tools
 *
 * This object contains all tool definitions that will be provided to the AI model.
 * Each tool includes a description, parameters schema, and execute function.
 *
 * @returns Object containing all available tools for AI model use
 */
export const tools = {
  ...generalTools,
  ...importedPdfTools,
  ...importedCampaignTools,
  ...importedSessionPlanningTools,
};

/**
 * Implementation of confirmation-required tools
 *
 * This object contains the actual logic for tools that need human approval.
 * Each function here corresponds to a tool above that doesn't have an execute function.
 *
 * These tools require user confirmation before execution for safety and control.
 *
 * @note Keys below should match toolsRequiringConfirmation in app.tsx
 */
// Import the proper type for tool execution
import type { ToolExecutionOptions } from "ai";

export const executions = {
  createCampaign: async (
    params: { name: string; jwt?: string },
    context?: ToolExecutionOptions
  ) => {
    return await importedCampaignTools.createCampaign.execute(
      params,
      context || ({} as ToolExecutionOptions)
    );
  },
  listCampaignResources: async (
    params: {
      campaignId: string;
      jwt?: string;
    },
    context?: ToolExecutionOptions
  ) => {
    return await importedCampaignTools.listCampaignResources.execute(
      params,
      context || ({} as ToolExecutionOptions)
    );
  },
  addResourceToCampaign: async (
    params: {
      campaignId: string;
      resourceType: "pdf" | "character" | "note" | "image";
      resourceId: string;
      resourceName?: string;
      jwt?: string;
    },
    context?: ToolExecutionOptions
  ) => {
    return await importedCampaignTools.addResourceToCampaign.execute(
      params,
      context || ({} as ToolExecutionOptions)
    );
  },
  removeResourceFromCampaign: async (
    params: {
      campaignId: string;
      resourceId: string;
      jwt?: string;
    },
    context?: ToolExecutionOptions
  ) => {
    return await importedCampaignTools.removeResourceFromCampaign.execute(
      params,
      context || ({} as ToolExecutionOptions)
    );
  },
  showCampaignDetails: async (
    params: { campaignId: string; jwt?: string },
    context?: ToolExecutionOptions
  ) => {
    return await importedCampaignTools.showCampaignDetails.execute(
      params,
      context || ({} as ToolExecutionOptions)
    );
  },
  listPdfFiles: async (
    params: { jwt?: string },
    context?: ToolExecutionOptions
  ) => {
    return await importedPdfTools.listPdfFiles.execute(
      params,
      context || ({} as ToolExecutionOptions)
    );
  },
  getPdfStats: async (
    params: { jwt?: string },
    context?: ToolExecutionOptions
  ) => {
    return await importedPdfTools.getPdfStats.execute(
      params,
      context || ({} as ToolExecutionOptions)
    );
  },
  deletePdfFile: async (
    params: { fileKey: string; jwt?: string },
    context?: ToolExecutionOptions
  ) => {
    console.log("[Tool Index] deletePdfFile called with params:", params);
    console.log("[Tool Index] fileKey from params:", params.fileKey);
    console.log("[Tool Index] jwt from params:", params.jwt);

    // Import the execution logic directly
    const { deletePdfFileExecution } = await import("./pdf/list-tools");
    return await deletePdfFileExecution(
      params,
      context || ({} as ToolExecutionOptions)
    );
  },
};
