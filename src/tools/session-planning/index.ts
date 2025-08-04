// Import all session planning tools
import {
  generateSessionScript,
  analyzeCampaignContext,
  validateSessionRequirements,
  determineSessionGoals,
  analyzeCharacterArcs,
  analyzeCampaignProgression,
  getSessionTemplates,
} from "./session-planning-tools";

// Export all session planning tools
export {
  generateSessionScript,
  analyzeCampaignContext,
  validateSessionRequirements,
  determineSessionGoals,
  analyzeCharacterArcs,
  analyzeCampaignProgression,
  getSessionTemplates,
} from "./session-planning-tools";

// Export the tools object for backward compatibility
export const sessionPlanningTools = {
  generateSessionScript,
  analyzeCampaignContext,
  validateSessionRequirements,
  determineSessionGoals,
  analyzeCharacterArcs,
  analyzeCampaignProgression,
  getSessionTemplates,
};
