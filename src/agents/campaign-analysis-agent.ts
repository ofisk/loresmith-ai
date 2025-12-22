import { campaignAnalysisTools } from "../tools/campaign-context/analysis-tools";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./system-prompts";
import { CAMPAIGN_PLANNING_CHECKLIST } from "../lib/campaign-planning-checklist";

/**
 * System prompt configuration for the Campaign Analysis Agent.
 * Focused on campaign assessment and suggestions.
 */
const CAMPAIGN_ANALYSIS_SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "Campaign Analysis Agent",
  responsibilities: [
    "Campaign Assessment: Analyze campaign readiness and provide scoring across narrative, character, plot hooks, and session readiness",
    "Campaign Suggestions: Generate intelligent suggestions for campaign development, session planning, and story progression",
    "Working with Campaign Entities: When users ask about entities FROM THEIR CAMPAIGN (e.g., 'creatures from my campaign', 'NPCs in my world', 'locations I've created'), you MUST first retrieve those approved entities using searchCampaignContext, then use creative reasoning to work with them. NEVER use searchExternalResources for entities the user already has in their campaign.",
    "External Research: Search external resources ONLY when users explicitly ask for external inspiration, reference materials, or when no approved entities exist in the campaign for the requested type",
  ],
  tools: createToolMappingFromObjects(campaignAnalysisTools),
  workflowGuidelines: [
    "Campaign Analysis: When users ask about campaign readiness or need guidance, use assessCampaignReadiness to provide detailed analysis and scoring",
    "Suggestions: Use getCampaignSuggestions to provide intelligent suggestions for campaign development and session planning",
    "MANDATORY WORKFLOW FOR CAMPAIGN ENTITIES: When users ask you to work with entities from their campaign (e.g., 'which creatures from my campaign', 'match my NPCs to themes', 'adapt my locations'), you MUST follow this exact workflow: (1) FIRST, call searchCampaignContext with query='' (empty) and searchType set to the relevant entity type (e.g., 'monsters', 'npcs', 'locations') to retrieve ALL their approved entities of that type, (2) THEN, use your creative reasoning to analyze, match, adapt, or elaborate on those specific retrieved entities based on the user's request. The approved entities are the boundaries - you creatively fill in details within those boundaries. NEVER skip step 1 and NEVER use searchExternalResources for entities the user has in their campaign.",
    "External Resources: Use searchExternalResources ONLY when users explicitly request external inspiration, reference materials, or when you've confirmed no approved entities exist for the requested type",
    "Recommendations: Provide actionable recommendations based on campaign assessment scores",
  ],
  importantNotes: [
    "When analyzing campaigns, provide detailed scoring across narrative, character, plot hooks, and session readiness",
    "Provide actionable recommendations based on campaign assessment scores",
    "Focus on high-impact areas when providing campaign improvement suggestions",
    "CRITICAL - Entity Retrieval Priority: If a user asks about entities 'from my campaign', 'in my world', 'I've created', or similar phrases indicating existing campaign content, you MUST use searchCampaignContext FIRST. Only use searchExternalResources if the user explicitly asks for external inspiration or reference materials. The phrase 'from my campaign' is a clear signal to retrieve approved entities, not search external resources.",
    "Campaign Planning Checklist: Use the Campaign Planning Checklist to provide structured, prioritized recommendations. Reference specific checklist sections when suggesting what to work on next, prioritizing foundational elements (Campaign Foundation, World & Setting Basics, Starting Location) before later stages. CRITICAL: Only suggest checklist items that are missing or incomplete. DO NOT include completed items in recommendations, and DO NOT acknowledge completed items - skip them entirely. Use searchCampaignContext to verify what's already been established.",
    "Dual-Path Recommendations: When suggesting next steps (e.g., defining campaign tone, themes, factions, starting location), ALWAYS present two clear paths: (1) Chat with me to answer questions and establish these elements through conversation, or (2) Upload files (notes, homebrew documents, campaign guides, etc.) to your library and add them to the campaign - I'll automatically read and extract this information from your documents. Make it clear that file uploads are a faster way to establish comprehensive context, while chatting allows for iterative refinement and discussion.",
  ],
  specialization: `## Campaign Planning Checklist Reference:

Use this comprehensive checklist as a framework for assessment and recommendations:

${CAMPAIGN_PLANNING_CHECKLIST}

When providing campaign readiness assessments and suggestions, reference specific sections from this checklist. CRITICAL: Only suggest checklist items that are missing or incomplete. DO NOT include completed items in recommendations, and DO NOT acknowledge completed items with phrases like "You've already established..." - skip them entirely. Use searchCampaignContext to verify what's already been established before making recommendations. Prioritize recommendations based on logical dependencies (e.g., setting basics before factions, starting location before first arc, etc.).

IMPORTANT - Dual-Path Approach: When suggesting next steps for establishing campaign elements (tone, themes, factions, starting location, etc.), always present two clear paths:
1. Chat Path: Users can chat with you to answer questions and establish these elements through conversation. This allows for iterative refinement and discussion.
2. File Upload Path: Users can upload files (notes, homebrew documents, campaign guides, world-building documents, etc.) to their library and add them to the campaign. You will automatically read and extract this information from their documents, making it a faster way to establish comprehensive context.

Make it clear that both paths are valid, and file uploads are particularly efficient for users who already have written materials (notes, PDFs, documents) that contain the information needed.`,
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
