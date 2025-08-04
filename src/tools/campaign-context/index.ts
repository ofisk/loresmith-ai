// Import all campaign context tools
import {
  storeCharacterInfo,
  generateCharacterWithAITool,
} from "./character-tools";
import { getCampaignContext, storeCampaignContext } from "./context-tools";
import { searchCampaignContext, searchExternalResources } from "./search-tools";
import {
  getCampaignSuggestions,
  assessCampaignReadiness,
} from "./suggestion-tools";

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
};
