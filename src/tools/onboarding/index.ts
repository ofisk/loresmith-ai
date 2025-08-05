export * from "./external-resources-tools";
export * from "./guidance-tools";
export * from "./state-analysis-tools";

// Export the tools object for the agent
export const onboardingTools = {
  // State analysis tools
  analyzeUserState: "analyzeUserState",
  getCampaignHealth: "getCampaignHealth",
  getUserActivity: "getUserActivity",

  // Guidance tools
  provideWelcomeGuidance: "provideWelcomeGuidance",
  suggestNextActions: "suggestNextActions",
  provideCampaignGuidance: "provideCampaignGuidance",

  // External resources tools
  recommendExternalTools: "recommendExternalTools",
  suggestInspirationSources: "suggestInspirationSources",
  recommendGMResources: "recommendGMResources",
} as const;
