// Import all onboarding tools
import {
  analyzeUserStateTool,
  getCampaignHealthTool,
  getUserActivityTool,
} from "./state-analysis-tools";
import {
  provideWelcomeGuidanceTool,
  suggestNextActionsTool,
  provideCampaignGuidanceTool,
} from "./guidance-tools";
import {
  recommendExternalToolsTool,
  suggestInspirationSourcesTool,
  recommendGMResourcesTool,
} from "./external-resources-tools";

// Export all onboarding tools
export {
  analyzeUserStateTool,
  getCampaignHealthTool,
  getUserActivityTool,
} from "./state-analysis-tools";
export {
  provideWelcomeGuidanceTool,
  suggestNextActionsTool,
  provideCampaignGuidanceTool,
} from "./guidance-tools";
export { recommendExternalToolsTool } from "./external-resources-tools";

// Export the tools object for the agent
export const onboardingTools = {
  // State analysis tools
  analyzeUserState: analyzeUserStateTool,
  getCampaignHealth: getCampaignHealthTool,
  getUserActivity: getUserActivityTool,

  // Guidance tools
  provideWelcomeGuidance: provideWelcomeGuidanceTool,
  suggestNextActions: suggestNextActionsTool,
  provideCampaignGuidance: provideCampaignGuidanceTool,

  // External resources tools
  recommendExternalTools: recommendExternalToolsTool,
  suggestInspirationSources: suggestInspirationSourcesTool,
  recommendGMResources: recommendGMResourcesTool,
};
