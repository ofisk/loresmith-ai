// Import all campaign tools
import {
  createCampaign,
  deleteCampaign,
  deleteCampaigns,
  listCampaigns,
  showCampaignDetails,
} from "./core-tools";
import { getPdfLibraryStats, searchPdfLibrary } from "./pdf-tools";
import { planSession, generateSessionHooks } from "./planning-tools";
import {
  addResourceToCampaign,
  removeResourceFromCampaign,
  listCampaignResources,
} from "./resource-tools";

// Export all campaign tools
export {
  // Campaign core tools
  createCampaign,
  deleteCampaign,
  deleteCampaigns,
  listCampaigns,
  showCampaignDetails,
  // Campaign planning tools
  planSession,
  generateSessionHooks,
  // Campaign resource tools
  addResourceToCampaign,
  removeResourceFromCampaign,
  listCampaignResources,
  // Campaign PDF tools
  getPdfLibraryStats,
  searchPdfLibrary,
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
  searchPdfLibrary,
  getPdfLibraryStats,
  planSession,
  generateSessionHooks,
};
