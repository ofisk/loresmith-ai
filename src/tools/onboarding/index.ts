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

export * from "./external-resources-tools";
export * from "./guidance-tools";
export * from "./state-analysis-tools";

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
} as const;
