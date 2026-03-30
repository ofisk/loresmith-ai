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
	checkHouseRuleConflictTool,
	createEntityRelationshipTool,
	defineHouseRuleTool,
	extractEntitiesFromContentTool,
	listHouseRulesTool,
	updateHouseRuleTool,
} from "./entity-tools";
import { generateContextRecapTool } from "./recap-tools";
import {
	lookupStatBlockTool,
	resolveRulesConflictTool,
	searchRulesTool,
} from "./rules-reference-tools";
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
	assessCampaignReadiness,
	checkHouseRuleConflictTool,
	createEntityRelationshipTool,
	defineHouseRuleTool,
	// Community tools
	detectCommunitiesTool,
	// Entity tools
	extractEntitiesFromContentTool,
	generateCharacterWithAITool,
	// Recap (context recap for returning users / campaign switch)
	generateContextRecapTool,
	// Suggestion tools
	getCampaignSuggestions,
	getCommunitiesTool,
	getCommunityHierarchyTool,
	listAllEntities,
	listHouseRulesTool,
	lookupStatBlockTool,
	// World state tools
	recordWorldEventTool,
	resolveRulesConflictTool,
	// Search tools
	searchCampaignContext,
	searchExternalResources,
	searchRulesTool,
	// Character tools
	storeCharacterInfo,
	updateEntityWorldStateTool,
	updateHouseRuleTool,
	updateRelationshipWorldStateTool,
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
	defineHouseRuleTool,
	listHouseRulesTool,
	updateHouseRuleTool,
	checkHouseRuleConflictTool,
	searchRulesTool,
	lookupStatBlockTool,
	resolveRulesConflictTool,
	recordWorldEventTool,
	updateEntityWorldStateTool,
	updateRelationshipWorldStateTool,
	generateContextRecapTool,
};
