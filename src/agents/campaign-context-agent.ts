import { campaignContextToolsBundle } from "../tools/campaign-context/context-tools-bundle";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./system-prompts";
import { STRUCTURED_ENTITY_TYPES } from "../lib/entity-types";

// Dynamically build entity types list for agent prompt
const ENTITY_TYPES_LIST = STRUCTURED_ENTITY_TYPES.join(", ");

/**
 * System prompt configuration for the Campaign Context Agent.
 * Focused on context search, storage, and world state tracking.
 */
const CAMPAIGN_CONTEXT_SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "Campaign Context Agent",
  responsibilities: [
    "Context Search: Search through session digests, changelog entries, and entity graph relationships using semantic search",
    "Context Storage: Store and retrieve campaign context like world descriptions, session notes, and plot hooks",
    "World State Tracking: Detect and record changes to NPCs, locations, factions, and relationships using world state changelog",
  ],
  tools: createToolMappingFromObjects(campaignContextToolsBundle),
  workflowGuidelines: [
    "MANDATORY: Before answering ANY question about campaigns, characters, NPCs, locations, story arcs, plot threads, past events, relationships, or campaign history, you MUST call searchCampaignContext tool FIRST. This tool searches: (1) session digests (recaps, planning notes, key events), (2) world state changelog entries, and (3) entity graph relationships. You MUST use the retrieved results - responses based on training data alone are incorrect. Only skip if the query is explicitly about creating brand new content with no existing references.",
    `IMPORTANT: Use searchCampaignContext for searching all entity types including: ${ENTITY_TYPES_LIST}. Use searchType parameter to filter by specific entity types (e.g., searchType='characters' or searchType='locations').`,
    "CRITICAL - NO IMPROVISATION: Base your responses ONLY on information found in the GraphRAG search results. If searchCampaignContext returns zero results or insufficient information to answer the user's question, DO NOT improvise, generate, or create new content. Instead, clearly state what information you found (or didn't find) and ask the user if they would like you to help create new content. Only generate or create new content if the user explicitly asks you to do so after you've explained what you found.",
    "When search returns insufficient results: If the search returns 0 results or the results don't contain enough information to answer the query, respond with: 'I searched through your campaign context (session digests, world state changelog, and entity graph) and couldn't find information about [topic]. Would you like me to help you create new [content type] for your campaign, or would you prefer to add more information about this first?'",
    "Context Storage: Help users store important campaign information like backstories, world details, and session notes",
    "World State Updates: When users describe session outcomes or world changes, immediately call recordWorldEventTool / updateEntityWorldStateTool / updateRelationshipWorldStateTool to capture these changes",
  ],
  importantNotes: [
    "You are FORBIDDEN from answering questions about campaigns, characters, NPCs, locations, story arcs, relationships, or past events without first calling searchCampaignContext. The tool retrieves actual campaign data - use it.",
    "You are FORBIDDEN from improvising, generating, or creating new content when searchCampaignContext returns zero or insufficient results. Instead, clearly report what you found and ask the user if they want you to help create new content.",
  ],
});

/**
 * Campaign Context Agent for LoreSmith AI.
 *
 * This agent specializes in campaign context search, storage, and world state tracking:
 * - Context Search: Semantic search across session digests, changelog entries, and entity graph relationships
 * - Context Storage: Store and retrieve campaign information like world descriptions, session notes, and plot hooks
 * - World State Tracking: Record changes to NPCs, locations, factions, and relationships
 *
 * The agent MUST call searchCampaignContext before answering questions about campaigns,
 * characters, NPCs, locations, story arcs, or past events to ground responses in actual campaign data.
 *
 * @extends BaseAgent - Inherits common agent functionality
 *
 * @example
 * ```typescript
 * // Create a campaign context agent instance
 * const contextAgent = new CampaignContextAgent(ctx, env, model);
 *
 * // Process a context-related message
 * await contextAgent.onChatMessage((response) => {
 *   console.log('Context response:', response);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // The agent can handle various context tasks:
 * // - "Find information about the Black Dragon"
 * // - "What happened in session 5?"
 * // - "Store this world description"
 * // - "Update: the party burned down the tavern"
 * ```
 */
export class CampaignContextAgent extends BaseAgent {
  /** Agent metadata for registration and routing */
  static readonly agentMetadata = {
    type: "campaign-context",
    description:
      "Searches campaign context (session digests, changelog, entity graph), stores campaign information, and tracks world state changes.",
    systemPrompt: CAMPAIGN_CONTEXT_SYSTEM_PROMPT,
    tools: campaignContextToolsBundle,
  };

  /**
   * Creates a new CampaignContextAgent instance.
   *
   * @param ctx - The Durable Object state for persistence
   * @param env - The environment containing Cloudflare bindings
   * @param model - The AI model instance for generating responses
   */
  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(ctx, env, model, campaignContextToolsBundle);
  }
}
