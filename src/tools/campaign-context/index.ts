// Import all campaign context tools

import { createCharacter, storeCharacterInfo } from "./character-tools";
import { getCampaignContext, storeCampaignContext } from "./context-tools";
import { searchCampaignContext } from "./search-tools";
import {
  assessCampaignReadiness,
  getIntelligentSuggestions,
} from "./suggestion-tools";

// Export AI helper functions
export {
  generateBackstory,
  generateCharacterWithAI,
  generateGoals,
  generatePersonalityTraits,
  generateRandomClass,
  generateRandomRace,
  generateRelationships,
} from "./ai-helpers";
export { createCharacter, storeCharacterInfo } from "./character-tools";
// Export all campaign context tools
export { getCampaignContext, storeCampaignContext } from "./context-tools";
export { searchCampaignContext } from "./search-tools";
export {
  assessCampaignReadiness,
  getIntelligentSuggestions,
} from "./suggestion-tools";

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
