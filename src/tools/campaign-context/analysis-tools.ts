// Campaign analysis tools bundle
import {
  assessCampaignReadiness,
  getCampaignSuggestions,
} from "./suggestion-tools";
import { searchExternalResources, searchCampaignContext } from "./search-tools";
import { showCampaignDetails, updateCampaign } from "../campaign/core-tools";
import { captureConversationalContext } from "./context-capture-tools";
import {
  getPlanningTaskProgress,
  recordPlanningTasks,
} from "./planning-task-tools";

export const campaignAnalysisTools = {
  assessCampaignReadiness,
  getCampaignSuggestions,
  searchExternalResources,
  searchCampaignContext,
  showCampaignDetails,
  updateCampaign,
  captureConversationalContext,
  recordPlanningTasks,
  getPlanningTaskProgress,
};
