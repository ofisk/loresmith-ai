// Import all campaign tools
import {
  createCampaign,
  deleteCampaign,
  deleteCampaigns,
  listCampaigns,
  showCampaignDetails,
} from "./core-tools";
import { getPdfLibraryStats, searchPdfLibrary } from "./pdf-tools";
import {
  planCampaignSession,
  suggestCampaignResources,
} from "./planning-tools";
import {
  addResourceToCampaign,
  listCampaignResources,
  removeResourceFromCampaign,
} from "./resource-tools";

// Export all campaign tools
export {
  createCampaign,
  deleteCampaign,
  deleteCampaigns,
  listCampaigns,
  showCampaignDetails,
} from "./core-tools";
export { getPdfLibraryStats, searchPdfLibrary } from "./pdf-tools";
export {
  planCampaignSession,
  suggestCampaignResources,
} from "./planning-tools";
export {
  addResourceToCampaign,
  listCampaignResources,
  removeResourceFromCampaign,
} from "./resource-tools";
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
  planCampaignSession,
  suggestCampaignResources,
};
