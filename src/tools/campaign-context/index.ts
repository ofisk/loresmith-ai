// Import all campaign context tools
import {
	generateCharacterWithAITool,
	storeCharacterInfo,
} from "./character-tools";
import {
	detectCommunitiesTool,
	getCommunitiesTool,
	getCommunityHierarchyTool,
} from "./community-tools";
import {
	createEntityRelationshipTool,
	extractEntitiesFromContentTool,
} from "./entity-tools";
import { generateContextRecapTool } from "./recap-tools";
import {
	listAllEntities,
	searchCampaignContext,
	searchExternalResources,
} from "./search-tools";
import {
	assessCampaignReadiness,
	getCampaignSuggestions,
} from "./suggestion-tools";
import {
	recordWorldEventTool,
	updateEntityWorldStateTool,
	updateRelationshipWorldStateTool,
} from "./world-state-tools";

export {
	// Character tools
	storeCharacterInfo,
	generateCharacterWithAITool,
	// Search tools
	searchCampaignContext,
	searchExternalResources,
	listAllEntities,
	// Suggestion tools
	getCampaignSuggestions,
	assessCampaignReadiness,
	// Community tools
	detectCommunitiesTool,
	getCommunitiesTool,
	getCommunityHierarchyTool,
	// Entity tools
	extractEntitiesFromContentTool,
	createEntityRelationshipTool,
	// World state tools
	recordWorldEventTool,
	updateEntityWorldStateTool,
	updateRelationshipWorldStateTool,
	// Recap (context recap for returning users / campaign switch)
	generateContextRecapTool,
};

// Export the tools object for backward compatibility
export const campaignContextTools = {
	storeCharacterInfo,
	generateCharacterWithAITool,
	getCampaignSuggestions,
	assessCampaignReadiness,
	searchCampaignContext,
	searchExternalResources,
	listAllEntities,
	detectCommunitiesTool,
	getCommunitiesTool,
	getCommunityHierarchyTool,
	extractEntitiesFromContentTool,
	createEntityRelationshipTool,
	recordWorldEventTool,
	updateEntityWorldStateTool,
	updateRelationshipWorldStateTool,
	generateContextRecapTool,
};
