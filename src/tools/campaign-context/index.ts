// Import all campaign context tools

import { createCharacter, storeCharacterInfo } from "./character-tools";
import { getCampaignContext, storeCampaignContext } from "./context-tools";
import { searchCampaignContext } from "./search-tools";
import {
  assessCampaignReadiness,
  getIntelligentSuggestions,
} from "./suggestion-tools";

// Export AI helper functions
export * from "./ai-helpers";
export * from "./character-tools";
export * from "./context-tools";
export * from "./search-tools";
export * from "./suggestion-tools";
export * from "./assessment-tools";
export * from "./assessment-core";

// Export the tools object for backward compatibility
export const campaignContextTools = {
  storeCampaignContext,
  getCampaignContext,
  storeCharacterInfo,
  createCharacter,
  getIntelligentSuggestions,
  assessCampaignReadiness,
  searchCampaignContext,
};
