// Import all campaign context tools
import {
  generateCharacterWithAITool,
  storeCharacterInfo,
} from "./character-tools";
import { searchCampaignContext, searchExternalResources } from "./search-tools";
import {
  assessCampaignReadiness,
  getCampaignSuggestions,
} from "./suggestion-tools";
import {
  detectCommunitiesTool,
  getCommunitiesTool,
  getCommunityHierarchyTool,
} from "./community-tools";
import {
  extractEntitiesFromContentTool,
  createEntityRelationshipTool,
} from "./entity-tools";
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
};

// Export the tools object for backward compatibility
export const campaignContextTools = {
  storeCharacterInfo,
  generateCharacterWithAITool,
  getCampaignSuggestions,
  assessCampaignReadiness,
  searchCampaignContext,
  searchExternalResources,
  detectCommunitiesTool,
  getCommunitiesTool,
  getCommunityHierarchyTool,
  extractEntitiesFromContentTool,
  createEntityRelationshipTool,
  recordWorldEventTool,
  updateEntityWorldStateTool,
  updateRelationshipWorldStateTool,
};
