// Tools for the Recap Agent (recap, next steps, and search to enrich session plan readout)
import { showCampaignDetails } from "@/tools/campaign/core-tools";
import { getChecklistStatusTool } from "./checklist-tools";
import {
	completePlanningTask,
	getPlanningTaskProgress,
	recordPlanningTasks,
} from "./planning-task-tools";
import {
	generateGMContextRecapTool,
	generatePlayerContextRecapTool,
	getSessionReadoutContext,
} from "./recap-tools";
import { searchCampaignContext } from "./search-tools";

/** GM recap tools: full planning flow, session readout, next steps */
export const gmRecapToolsBundle = {
	generateGMContextRecapTool,
	getPlanningTaskProgress,
	recordPlanningTasks,
	completePlanningTask,
	getChecklistStatusTool,
	showCampaignDetails,
	searchCampaignContext,
	getSessionReadoutContext,
};

/** Player recap tools: player-focused recap, search (sanitized), campaign details */
export const playerRecapToolsBundle = {
	generatePlayerContextRecapTool,
	showCampaignDetails,
	searchCampaignContext,
};

/** Default bundle for RecapAgent (used when role is unknown; GM tools as fallback) */
export const recapAgentToolsBundle = gmRecapToolsBundle;
