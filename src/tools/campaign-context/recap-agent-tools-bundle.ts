// Tools for the Recap Agent only (recap + next steps; no search or entity CRUD)
import { showCampaignDetails } from "../campaign/core-tools";
import { getChecklistStatusTool } from "./checklist-tools";
import {
  getPlanningTaskProgress,
  recordPlanningTasks,
} from "./planning-task-tools";
import { generateContextRecapTool } from "./recap-tools";

export const recapAgentToolsBundle = {
  generateContextRecapTool,
  getPlanningTaskProgress,
  recordPlanningTasks,
  getChecklistStatusTool,
  showCampaignDetails,
};
