// Import all campaign tools
import {
  createCampaign,
  deleteCampaign,
  deleteCampaigns,
  listCampaigns,
  resolveCampaignIdentifier,
  showCampaignDetails,
  updateCampaign,
} from "./core-tools";
import { getFileLibraryStats, searchFileLibrary } from "./file-tools";
import {
  checkPlanningReadiness,
  generateSessionHooks,
  planSession,
} from "./planning-tools";
import {
  addResourceToCampaign,
  listCampaignResources,
  removeResourceFromCampaign,
} from "./resource-tools";
import {
  captureConversationalContext,
  saveContextExplicitly,
} from "../campaign-context/context-capture-tools";
import { searchCampaignContext } from "../campaign-context/search-tools";
import {
  recordWorldEventTool,
  updateEntityWorldStateTool,
  updateRelationshipWorldStateTool,
} from "../campaign-context/world-state-tools";
import {
  updateEntityMetadataTool,
  updateEntityTypeTool,
  deleteEntityTool,
} from "../campaign-context/entity-tools";
// Import file management tools for campaign operations
import { listFiles, getFileStats } from "../file/index";
import { noOpTool } from "../common/no-op-tool";

// Export all campaign tools
export {
  // Campaign core tools
  createCampaign,
  deleteCampaign,
  deleteCampaigns,
  listCampaigns,
  showCampaignDetails,
  updateCampaign,
  resolveCampaignIdentifier,
  // Campaign planning tools
  planSession,
  checkPlanningReadiness,
  generateSessionHooks,
  // Campaign resource tools
  addResourceToCampaign,
  removeResourceFromCampaign,
  listCampaignResources,
  // Campaign file tools
  getFileLibraryStats,
  searchFileLibrary,
  // File management tools for campaign operations
  listFiles,
  getFileStats,
  // Campaign context capture tools
  captureConversationalContext,
  saveContextExplicitly,
  searchCampaignContext,
  recordWorldEventTool,
  updateEntityWorldStateTool,
  updateRelationshipWorldStateTool,
  updateEntityMetadataTool,
  updateEntityTypeTool,
  deleteEntityTool,
  noOpTool,
};

// Export the tools object for backward compatibility
export const campaignTools = {
  listCampaigns,
  createCampaign,
  showCampaignDetails,
  updateCampaign,
  deleteCampaign,
  deleteCampaigns,
  listCampaignResources,
  addResourceToCampaign,
  removeResourceFromCampaign,
  searchFileLibrary,
  getFileLibraryStats,
  // File management tools for campaign operations
  listFiles,
  getFileStats,
  planSession,
  checkPlanningReadiness,
  generateSessionHooks,
  resolveCampaignIdentifier,
  captureConversationalContext,
  saveContextExplicitly,
  searchCampaignContext,
  recordWorldEventTool,
  updateEntityWorldStateTool,
  updateRelationshipWorldStateTool,
  updateEntityMetadataTool,
  updateEntityTypeTool,
  deleteEntityTool,
  noOpTool,
};
