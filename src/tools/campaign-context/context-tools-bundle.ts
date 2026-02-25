// Campaign context search and storage tools bundle

import { showCampaignDetails } from "../campaign/core-tools";
import { getMessageHistory } from "../message-history-tools";
import { getChecklistStatusTool } from "./checklist-tools";
import { captureConversationalContext } from "./context-capture-tools";
import {
	deleteEntityTool,
	updateEntityMetadataTool,
	updateEntityTypeTool,
} from "./entity-tools";
import { getDocumentContent } from "./get-document-content-tool";
import {
	completePlanningTask,
	getPlanningTaskProgress,
	recordPlanningTasks,
} from "./planning-task-tools";
import { generateContextRecapTool } from "./recap-tools";
import {
	listAllEntities,
	searchCampaignContext,
	searchExternalResources,
} from "./search-tools";
import {
	recordWorldEventTool,
	updateEntityWorldStateTool,
	updateRelationshipWorldStateTool,
} from "./world-state-tools";

export const campaignContextToolsBundle = {
	searchCampaignContext,
	searchExternalResources,
	listAllEntities,
	showCampaignDetails,
	getDocumentContent,
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

/** Player-facing subset: search, list (sanitized), campaign details, message history */
export const playerCampaignContextToolsBundle = {
	searchCampaignContext,
	listAllEntities,
	showCampaignDetails,
	getMessageHistory,
};
