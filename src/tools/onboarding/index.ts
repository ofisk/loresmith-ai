import {
  recommendExternalToolsTool,
  recommendGMResourcesTool,
  suggestInspirationSourcesTool,
} from "./external-resources-tools";
import {
  provideCampaignGuidanceTool,
  provideWelcomeGuidanceTool,
  suggestNextActionsTool,
} from "./guidance-tools";
import {
  analyzeUserStateTool,
  getCampaignReadinessTool,
  getUserActivityTool,
} from "./state-analysis-tools";

export * from "./external-resources-tools";
export * from "./guidance-tools";
export * from "./state-analysis-tools";

// Export the tools object for the agent
export const onboardingTools = {
  // State analysis tools
  analyzeUserState: analyzeUserStateTool,
  getCampaignReadiness: getCampaignReadinessTool,
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
