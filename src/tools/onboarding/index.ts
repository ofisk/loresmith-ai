export * from "./external-resources-tools";
export * from "./guidance-tools";
export * from "./state-analysis-tools";

// Import the actual tool objects
import {
  analyzeUserState,
  getCampaignHealth,
  getUserActivity,
} from "./state-analysis-tools";
import {
  provideWelcomeGuidance,
  suggestNextActions,
  provideCampaignGuidance,
} from "./guidance-tools";
import {
  recommendExternalTools,
  suggestInspirationSources,
  recommendGMResources,
} from "./external-resources-tools";

// Export the tools object for the agent
export const onboardingTools = {
  // State analysis tools
  analyzeUserState,
  getCampaignHealth,
  getUserActivity,

  // Guidance tools
  provideWelcomeGuidance,
  suggestNextActions,
  provideCampaignGuidance,

  // External resources tools
  recommendExternalTools,
  suggestInspirationSources,
  recommendGMResources,
} as const;
