import { campaignAnalysisTools } from "../tools/campaign-context/analysis-tools";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./system-prompts";

/**
 * System prompt configuration for the Campaign Analysis Agent.
 * Focused on campaign assessment and suggestions.
 */
const CAMPAIGN_ANALYSIS_SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "Campaign Analysis Agent",
  responsibilities: [
    "Campaign Assessment: Analyze campaign readiness and provide scoring across narrative, character, plot hooks, and session readiness",
    "Campaign Suggestions: Generate intelligent suggestions for campaign development, session planning, and story progression",
    "External Research: Search external resources when needed for campaign inspiration and information",
  ],
  tools: createToolMappingFromObjects(campaignAnalysisTools),
  workflowGuidelines: [
    "Campaign Analysis: When users ask about campaign readiness or need guidance, use assessCampaignReadiness to provide detailed analysis and scoring",
    "Suggestions: Use getCampaignSuggestions to provide intelligent suggestions for campaign development and session planning",
    "External Resources: Use searchExternalResources when users need inspiration or information from external sources",
    "Recommendations: Provide actionable recommendations based on campaign assessment scores",
  ],
  importantNotes: [
    "When analyzing campaigns, provide detailed scoring across narrative, character, plot hooks, and session readiness",
    "Provide actionable recommendations based on campaign assessment scores",
    "Focus on high-impact areas when providing campaign improvement suggestions",
  ],
});

/**
 * Campaign Analysis Agent for LoreSmith AI.
 *
 * This agent specializes in campaign assessment and analysis, including:
 * - Campaign readiness assessment and scoring
 * - Intelligent suggestions for campaign development and session planning
 * - External resource search for inspiration
 *
 * The agent helps users understand their campaign's health across multiple
 * dimensions and provides actionable recommendations for improvement.
 *
 * @extends BaseAgent - Inherits common agent functionality
 */
export class CampaignAnalysisAgent extends BaseAgent {
  /** Agent metadata for registration and routing */
  static readonly agentMetadata = {
    type: "campaign-analysis",
    description:
      "Analyzes campaign readiness, provides scoring, and generates suggestions for campaign development and session planning.",
    systemPrompt: CAMPAIGN_ANALYSIS_SYSTEM_PROMPT,
    tools: campaignAnalysisTools,
  };

  /**
   * Creates a new CampaignAnalysisAgent instance.
   *
   * @param ctx - The Durable Object state for persistence
   * @param env - The environment containing Cloudflare bindings
   * @param model - The AI model instance for generating responses
   */
  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(ctx, env, model, campaignAnalysisTools);
  }
}
