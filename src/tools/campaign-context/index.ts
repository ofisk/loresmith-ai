// Import all campaign context tools
import {
  generateCharacterWithAITool,
  storeCharacterInfo,
} from "./character-tools";
import { getCampaignContext, storeCampaignContext } from "./context-tools";
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

export {
  // Character tools
  storeCharacterInfo,
  generateCharacterWithAITool,
  // Context tools
  getCampaignContext,
  storeCampaignContext,
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
};

// Export the tools object for backward compatibility
export const campaignContextTools = {
  storeCampaignContext,
  getCampaignContext,
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
};
