// Campaign analysis tools bundle
import {
  assessCampaignReadiness,
  getCampaignSuggestions,
} from "./suggestion-tools";
import { searchExternalResources, searchCampaignContext } from "./search-tools";
import { showCampaignDetails } from "../campaign/core-tools";

export const campaignAnalysisTools = {
  assessCampaignReadiness,
  getCampaignSuggestions,
  searchExternalResources,
  searchCampaignContext,
  showCampaignDetails,
};
