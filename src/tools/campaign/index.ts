// Import all campaign tools
import {
  createCampaign,
  deleteCampaign,
  deleteCampaigns,
  listCampaigns,
  resolveCampaignIdentifier,
  showCampaignDetails,
} from "./core-tools";
import { getFileLibraryStats, searchFileLibrary } from "./file-tools";
import { generateSessionHooks, planSession } from "./planning-tools";
import {
  addResourceToCampaign,
  listCampaignResources,
  removeResourceFromCampaign,
} from "./resource-tools";
import {
  captureConversationalContext,
  saveContextExplicitly,
} from "../campaign-context/context-capture-tools";

// Export all campaign tools
export {
  // Campaign core tools
  createCampaign,
  deleteCampaign,
  deleteCampaigns,
  listCampaigns,
  showCampaignDetails,
  resolveCampaignIdentifier,
  // Campaign planning tools
  planSession,
  generateSessionHooks,
  // Campaign resource tools
  addResourceToCampaign,
  removeResourceFromCampaign,
  listCampaignResources,
  // Campaign file tools
  getFileLibraryStats,
  searchFileLibrary,
  // Campaign context capture tools
  captureConversationalContext,
  saveContextExplicitly,
};
export { CampaignTool } from "./utils";

// Export the tools object for backward compatibility
export const campaignTools = {
  listCampaigns,
  createCampaign,
  showCampaignDetails,
  deleteCampaign,
  deleteCampaigns,
  listCampaignResources,
  addResourceToCampaign,
  removeResourceFromCampaign,
  searchFileLibrary,
  getFileLibraryStats,
  planSession,
  generateSessionHooks,
  resolveCampaignIdentifier,
  captureConversationalContext,
  saveContextExplicitly,
};
