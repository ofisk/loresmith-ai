/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */

// Campaign-related tools
import { campaignTools as importedCampaignTools } from "./campaign";
// PDF-related tools have been moved to ./tools/pdfTools.ts
import { pdfTools as importedPdfTools } from "./pdf";
// General tools
import { tools as generalTools } from "./tools";

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

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  ...generalTools,
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
