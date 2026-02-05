// Campaign context search and storage tools bundle
import {
  searchCampaignContext,
  searchExternalResources,
  listAllEntities,
} from "./search-tools";
import {
  recordWorldEventTool,
  updateEntityWorldStateTool,
  updateRelationshipWorldStateTool,
} from "./world-state-tools";
import {
  updateEntityMetadataTool,
  updateEntityTypeTool,
  deleteEntityTool,
} from "./entity-tools";
import { showCampaignDetails } from "../campaign/core-tools";
import { getMessageHistory } from "../message-history-tools";
import { getChecklistStatusTool } from "./checklist-tools";
import {
  recordPlanningTasks,
  getPlanningTaskProgress,
  completePlanningTask,
} from "./planning-task-tools";
import { generateContextRecapTool } from "./recap-tools";
import { captureConversationalContext } from "./context-capture-tools";

export const campaignContextToolsBundle = {
  searchCampaignContext,
  searchExternalResources,
  listAllEntities,
  showCampaignDetails,
  recordWorldEventTool,
  updateEntityWorldStateTool,
  updateRelationshipWorldStateTool,
  updateEntityMetadataTool,
  updateEntityTypeTool,
  deleteEntityTool,
  getMessageHistory,
  getChecklistStatusTool,
  recordPlanningTasks,
  getPlanningTaskProgress,
  completePlanningTask,
  generateContextRecapTool,
  captureConversationalContext,
};
