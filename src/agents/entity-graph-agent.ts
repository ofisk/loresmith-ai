import { entityGraphTools } from "../tools/campaign-context/entity-graph-tools";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./systemPrompts";

/**
 * System prompt configuration for the Entity Graph Agent.
 * Focused on entity extraction, relationship management, and community detection.
 */
const ENTITY_GRAPH_SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "Entity Graph Agent",
  responsibilities: [
    "Entity Extraction: Extract structured entities (NPCs, locations, items, monsters, etc.) from text content and add them to the entity graph",
    "Relationship Management: Create relationships between entities in the graph when users mention connections",
    "Community Detection: Analyze entity relationship graphs to identify clusters of related entities using graph algorithms",
  ],
  tools: createToolMappingFromObjects(entityGraphTools),
  workflowGuidelines: [
    "Entity Extraction: When users provide text content (from files or chat) containing entities like NPCs, locations, items, or monsters, use extractEntitiesFromContentTool to extract and add them to the graph",
    "Relationship Creation: When users mention relationships between entities (e.g., 'NPC X lives in Location Y', 'Character A is allied with Character B'), use createEntityRelationshipTool to create the relationship in the graph",
    "Community Detection: When users want to understand how entities cluster or find related groups, use detectCommunitiesTool to analyze the entity graph",
    "Community Analysis: Use getCommunitiesTool or getCommunityHierarchyTool to show users existing communities and their structure",
  ],
  importantNotes: [
    "Entity extraction and relationship creation help build the entity graph, which is then used for context search and community detection",
    "Before creating relationships, ensure both entities exist in the graph (create them first using extractEntitiesFromContentTool if needed)",
  ],
});

/**
 * Entity Graph Agent for LoreSmith AI.
 *
 * This agent specializes in managing the entity relationship graph, including:
 * - Extracting entities from text content
 * - Creating relationships between entities
 * - Detecting communities/clusters of related entities
 *
 * The agent helps users build their entity graph by extracting entities from
 * text content and creating relationships between them as they describe their
 * campaign world. It can also analyze the graph to find communities of related
 * entities.
 *
 * @extends BaseAgent - Inherits common agent functionality
 */
export class EntityGraphAgent extends BaseAgent {
  /** Agent metadata for registration and routing */
  static readonly agentMetadata = {
    type: "entity-graph",
    description:
      "Manages entity extraction, relationship creation, and community detection in the entity relationship graph.",
    systemPrompt: ENTITY_GRAPH_SYSTEM_PROMPT,
    tools: entityGraphTools,
  };

  /**
   * Creates a new EntityGraphAgent instance.
   *
   * @param ctx - The Durable Object state for persistence
   * @param env - The environment containing Cloudflare bindings
   * @param model - The AI model instance for generating responses
   */
  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(ctx, env, model, entityGraphTools);
  }
}
