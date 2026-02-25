// Import all campaign tools

import {
	captureConversationalContext,
	saveContextExplicitly,
} from "../campaign-context/context-capture-tools";
import {
	deleteEntityTool,
	updateEntityMetadataTool,
	updateEntityTypeTool,
} from "../campaign-context/entity-tools";
import {
	getPlanningTaskProgress,
	recordPlanningTasks,
} from "../campaign-context/planning-task-tools";
import {
	listAllEntities,
	searchCampaignContext,
} from "../campaign-context/search-tools";
import {
	recordWorldEventTool,
	updateEntityWorldStateTool,
	updateRelationshipWorldStateTool,
} from "../campaign-context/world-state-tools";
import { noOpTool } from "../common/no-op-tool";
// Import file management tools for campaign operations
import { getFileStats, listFiles } from "../file/index";
import {
	createCampaign,
	deleteCampaign,
	deleteCampaigns,
	listCampaigns,
	resolveCampaignIdentifier,
	showCampaignDetails,
	updateCampaign,
} from "./core-tools";
import { getFileLibraryStats, searchFileLibrary } from "./file-tools";
import {
	checkPlanningReadiness,
	generateSessionHooks,
	planSession,
} from "./planning-tools";
import {
	addResourceToCampaign,
	listCampaignResources,
	proposeResourceToCampaign,
	removeResourceFromCampaign,
} from "./resource-tools";

// Export all campaign tools
export {
	// Campaign core tools
	createCampaign,
	deleteCampaign,
	deleteCampaigns,
	listCampaigns,
	showCampaignDetails,
	updateCampaign,
	resolveCampaignIdentifier,
	// Campaign planning tools
	planSession,
	checkPlanningReadiness,
	generateSessionHooks,
	// Campaign resource tools
	addResourceToCampaign,
	proposeResourceToCampaign,
	removeResourceFromCampaign,
	listCampaignResources,
	// Campaign file tools
	getFileLibraryStats,
	searchFileLibrary,
	// File management tools for campaign operations
	listFiles,
	getFileStats,
	// Campaign context capture tools
	captureConversationalContext,
	saveContextExplicitly,
	recordPlanningTasks,
	getPlanningTaskProgress,
	searchCampaignContext,
	listAllEntities,
	recordWorldEventTool,
	updateEntityWorldStateTool,
	updateRelationshipWorldStateTool,
	updateEntityMetadataTool,
	updateEntityTypeTool,
	deleteEntityTool,
	noOpTool,
};

/** Player-facing campaign tools: list, create, show, resources (list + propose), search, file library, no-op */
export const playerCampaignTools = {
	listCampaigns,
	createCampaign,
	showCampaignDetails,
	listCampaignResources,
	proposeResourceToCampaign,
	searchCampaignContext,
	listAllEntities,
	searchFileLibrary,
	getFileLibraryStats,
	listFiles,
	getFileStats,
	resolveCampaignIdentifier,
	noOpTool,
};

// Export the tools object for backward compatibility
export const campaignTools = {
	listCampaigns,
	createCampaign,
	showCampaignDetails,
	updateCampaign,
	deleteCampaign,
	deleteCampaigns,
	listCampaignResources,
	addResourceToCampaign,
	proposeResourceToCampaign,
	removeResourceFromCampaign,
	searchFileLibrary,
	getFileLibraryStats,
	// File management tools for campaign operations
	listFiles,
	getFileStats,
	planSession,
	checkPlanningReadiness,
	generateSessionHooks,
	resolveCampaignIdentifier,
	captureConversationalContext,
	saveContextExplicitly,
	recordPlanningTasks,
	getPlanningTaskProgress,
	searchCampaignContext,
	listAllEntities,
	recordWorldEventTool,
	updateEntityWorldStateTool,
	updateRelationshipWorldStateTool,
	updateEntityMetadataTool,
	updateEntityTypeTool,
	deleteEntityTool,
	noOpTool,
};
