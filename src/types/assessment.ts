/**
 * Centralized type definitions for the assessment system
 * This file consolidates all assessment-related interfaces to eliminate duplication
 */

export interface UserState {
  isFirstTime: boolean;
  hasCampaigns: boolean;
  hasResources: boolean;
  campaignCount: number;
  resourceCount: number;
  recentActivity: ActivityType[];
  lastLoginDate: string;
  totalSessionTime: number;
}

export interface ActivityType {
  type:
    | "campaign_created"
    | "resource_uploaded"
    | "character_created"
    | "session_planned";
  timestamp: string;
  details: string;
}

export interface CampaignReadinessSummary {
  overallScore: number;
  campaignState: string;
  priorityAreas: string[];
  recommendations: string[];
}

export interface ActionSuggestion {
  title: string;
  description: string;
  action: string;
  priority: "high" | "medium" | "low";
  estimatedTime: string;
}

export interface ToolRecommendation {
  name: string;
  url: string;
  description: string;
  category: "inspiration" | "tools" | "community" | "content";
  relevance: "high" | "medium" | "low";
}

/**
 * Campaign-aware guidance response
 */
export interface CampaignAwareGuidance {
  userState: UserState;
  campaignReadiness?: CampaignReadinessSummary;
  primaryAction: ActionSuggestion;
  secondaryActions: ActionSuggestion[];
  explanation: string;
  externalTools?: ToolRecommendation[];
}

/**
 * Base assessment interface for composition pattern
 */
export interface BaseAssessment {
  overallScore: number;
  campaignState: string;
  priorityAreas: string[];
}

/**
 * Extended assessment interfaces that inherit from BaseAssessment
 */
export interface DetailedCampaignAssessment extends BaseAssessment {
  dimensions: {
    narrative: NarrativeAssessment;
    characters: CharacterAssessment;
    plotHooks: PlotHookAssessment;
    sessionReadiness: SessionReadiness;
  };
  recommendations: Recommendation[];
}

export interface NarrativeAssessment {
  score: number;
  worldDescription: boolean;
  storyArc: boolean;
  themes: boolean;
  conflicts: boolean;
}

export interface CharacterAssessment {
  score: number;
  playerCharacters: number;
  npcs: number;
  relationships: boolean;
  motivations: boolean;
}

export interface PlotHookAssessment {
  score: number;
  activeHooks: number;
  playerHooks: number;
  worldHooks: number;
  escalationPaths: boolean;
}

export interface SessionReadiness {
  score: number;
  preparedHooks: number;
  playerInvestment: boolean;
  adaptability: boolean;
}

export interface Recommendation {
  type: "campaign" | "session" | "character" | "world";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  actionableSteps: string[];
  estimatedTime: string;
  impact: "high" | "medium" | "low";
}
