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
  createCampaign: async (params: { name: string; jwt?: string }) => {
    return importedCampaignTools.createCampaign.execute(
      params,
      {} as ToolExecutionOptions
    );
  },
  listCampaignResources: async (params: {
    campaignId: string;
    jwt?: string;
  }) => {
    return importedCampaignTools.listCampaignResources.execute(
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
    return importedCampaignTools.addResourceToCampaign.execute(
      params,
      {} as ToolExecutionOptions
    );
  },
  showCampaignDetails: async (params: { campaignId: string; jwt?: string }) => {
    return importedCampaignTools.showCampaignDetails.execute(
      params,
      {} as ToolExecutionOptions
    );
  },
};
