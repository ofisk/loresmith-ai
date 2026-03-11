// Campaign analysis tools bundle

import {
	showCampaignDetails,
	updateCampaign,
} from "@/tools/campaign/core-tools";
import { captureConversationalContext } from "./context-capture-tools";
import {
	getPlanningTaskProgress,
	recordPlanningTasks,
} from "./planning-task-tools";
import { searchCampaignContext, searchExternalResources } from "./search-tools";
import {
	assessCampaignReadiness,
	getCampaignSuggestions,
} from "./suggestion-tools";

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
