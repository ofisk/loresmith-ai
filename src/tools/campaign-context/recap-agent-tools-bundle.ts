// Tools for the Recap Agent (recap, next steps, and search to enrich session plan readout)
import { showCampaignDetails } from "../campaign/core-tools";
import { getChecklistStatusTool } from "./checklist-tools";
import {
  getPlanningTaskProgress,
  recordPlanningTasks,
} from "./planning-task-tools";
import {
  generateContextRecapTool,
  getSessionReadoutContext,
} from "./recap-tools";
import { searchCampaignContext } from "./search-tools";

export const recapAgentToolsBundle = {
  generateContextRecapTool,
  getPlanningTaskProgress,
  recordPlanningTasks,
  getChecklistStatusTool,
  showCampaignDetails,
  searchCampaignContext,
  getSessionReadoutContext,
};
