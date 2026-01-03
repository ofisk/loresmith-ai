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
    "MANDATORY: Before answering ANY question about campaigns, characters, NPCs, locations, story arcs, plot threads, past events, relationships, or campaign history, you MUST call searchCampaignContext tool FIRST. This tool searches: (1) session digests (recaps, planning notes, key events), (2) world state changelog entries, (3) entity graph relationships, and (4) original source files when requested. You MUST use the retrieved results - responses based on training data alone are incorrect. Only skip if the query is explicitly about creating brand new content with no existing references.",
    "ORIGINAL FILE SEARCH: When users explicitly ask to 'search back through the original text', 'search the source files', 'find in the original documents', 'look in the uploaded files', or similar phrases, you MUST set searchOriginalFiles=true in the searchCampaignContext tool. This performs lexical (text) search through the original uploaded files (PDFs, text files) associated with the campaign, returning matching text chunks with their source file names. This is different from entity search - it searches raw file content, not extracted entities.",
    "CRITICAL - Campaign Details First: When generating context recaps or making campaign planning recommendations, you MUST FIRST call showCampaignDetails to retrieve the campaign's description and metadata. This ensures you check for existing information (like tone, themes, world name, starting location) in the campaign metadata before making recommendations. Only after checking campaign details should you search for additional context using searchCampaignContext.",
    `IMPORTANT: Use searchCampaignContext for searching all entity types including: ${ENTITY_TYPES_LIST}. Include entity type names in your query to filter (e.g., query='characters' or query='locations', query='fire monsters' to search for monsters matching 'fire').`,
    `APPROVED ENTITIES AS CREATIVE BOUNDARIES: Approved entities (shards) in the campaign form the structural foundation for your responses. When users ask you to work with entities, first retrieve the relevant approved entities from their campaign. These approved entities define what exists in their world - they are the boundaries. Within those boundaries, use your creative reasoning to interpret, match, adapt, or elaborate on the entities based on the user's request. The approved entities provide the outline - you fill in the creative details within that outline. For example, if asked to match creatures to themes, retrieve the user's approved creatures first, then creatively analyze how they might align with those themes based on their characteristics, even if the theme keywords aren't explicitly in the entity metadata.`,
    "ITERATIVE GRAPH NAVIGATION: Use graph traversal to explore entity relationships iteratively. Workflow: (1) Start with semantic search to find relevant entities (e.g., query='Location X', searchType='locations'), (2) Analyze results to extract entity IDs, (3) If more context is needed, use traverseFromEntityIds parameter with those entity IDs to traverse the graph, (4) Start with traverseDepth=1 (direct neighbors), increase depth if needed, (5) Optionally filter by traverseRelationshipTypes for specific relationship types (e.g., ['resides_in'] for location queries), (6) Continue traversing until you have enough context or no more relevant entities are found, (7) Use accumulated context to answer the user's question.",
    "CRITICAL - 'X within Y' QUERIES: When users ask for entities 'within' or 'inside' another entity (e.g., 'locations within [location]', 'NPCs in [place]', 'sublocations of [location]'), you MUST first identify the parent entity before searching for contained entities. Workflow: (1) Search for the parent entity to find its entity ID, (2) Use traverseFromEntityIds with that parent entity ID and appropriate traverseRelationshipTypes (e.g., ['located_in'] for locations within a location) to find entities contained within the parent. You may need multiple traversal steps depending on the query complexity. Do NOT just search for the entity type alone (e.g., query='locations') - that returns ALL entities of that type across the entire campaign, not just those within the specified parent.",
    "CRITICAL - RELATIONSHIPS OVERRIDE CONTENT: Entity search results include explicit relationships from the entity graph. These relationships are shown FIRST in the results, before entity content. ONLY use explicit relationships shown in the results. If a relationship type is not listed in the explicit relationships section, that relationship does NOT exist for that entity, even if the entity content text mentions it. Do NOT infer relationships from entity content text, names, or descriptions. Entity content may mention relationships that are NOT verified in the entity graph.",
    "CRITICAL - NO IMPROVISATION: Base your responses ONLY on information found in the GraphRAG search results. If searchCampaignContext returns zero results or insufficient information to answer the user's question, DO NOT improvise, generate, or create new content. Instead, clearly state what information you found (or didn't find) and ask the user if they would like you to help create new content. Only generate or create new content if the user explicitly asks you to do so after you've explained what you found.",
    "When search returns insufficient results: If the search returns 0 results or the results don't contain enough information to answer the query, try graph traversal before giving up. Extract entity IDs from initial results and traverse from them. If traversal also yields insufficient results, respond with: 'I searched through your campaign context (session digests, world state changelog, and entity graph) and couldn't find information about [topic]. Would you like me to help you create new [content type] for your campaign, or would you prefer to add more information about this first?'",
    "Context Storage: Help users store important campaign information like backstories, world details, and session notes",
    "World State Updates: When users describe session outcomes or world changes, immediately call recordWorldEventTool / updateEntityWorldStateTool / updateRelationshipWorldStateTool to capture these changes",
  ],
  importantNotes: [
    "You are FORBIDDEN from answering questions about campaigns, characters, NPCs, locations, story arcs, relationships, or past events without first calling searchCampaignContext. The tool retrieves actual campaign data - use it.",
    "You are FORBIDDEN from improvising, generating, or creating new content when searchCampaignContext returns zero or insufficient results. Instead, clearly report what you found and ask the user if they want you to help create new content.",
    "RELATIONSHIP PRIORITY: Explicit relationships shown in search results ALWAYS override any relationship mentions in entity content text. If a relationship is not shown in the explicit relationships section, it does NOT exist, regardless of what the content text says.",
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
