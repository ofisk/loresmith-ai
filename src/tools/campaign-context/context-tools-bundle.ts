// Campaign context search and storage tools bundle

import { showCampaignDetails } from "../campaign/core-tools";
import { searchVisualInspirationTool } from "../campaign/file-tools";
import { getMessageHistory } from "../message-history-tools";
import { getChecklistStatusTool } from "./checklist-tools";
import { captureConversationalContext } from "./context-capture-tools";
import {
	checkHouseRuleConflictTool,
	defineHouseRuleTool,
	deleteEntityTool,
	linkInspirationToEntityTool,
	listHouseRulesTool,
	updateEntityMetadataTool,
	updateEntityTypeTool,
	updateHouseRuleTool,
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
	addTimelineEventTool,
	buildTimelineTool,
	queryTimelineRangeTool,
} from "./timeline-tools";
import {
	recordWorldEventTool,
	updateEntityWorldStateTool,
	updateRelationshipWorldStateTool,
} from "./world-state-tools";

export const campaignContextToolsBundle = {
	searchCampaignContext,
	searchExternalResources,
	searchVisualInspirationTool,
	listAllEntities,
	showCampaignDetails,
	getDocumentContent,
	recordWorldEventTool,
	updateEntityWorldStateTool,
	updateRelationshipWorldStateTool,
	buildTimelineTool,
	addTimelineEventTool,
	queryTimelineRangeTool,
	updateEntityMetadataTool,
	updateEntityTypeTool,
	deleteEntityTool,
	linkInspirationToEntityTool,
	defineHouseRuleTool,
	listHouseRulesTool,
	updateHouseRuleTool,
	checkHouseRuleConflictTool,
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
	listHouseRulesTool,
	getMessageHistory,
};
