import { isGMRole } from "@/constants/campaign-roles";
import { entityGraphTools } from "@/tools/campaign-context/entity-graph-tools";
import type { CampaignRole } from "@/types/campaign";
import { BaseAgent } from "./base-agent";
import {
	buildSystemPrompt,
	createToolMappingFromObjects,
} from "./system-prompts";

/**
 * System prompt configuration for the Entity Graph Agent.
 * Focused on entity extraction, relationship management, and community detection.
 */
const ENTITY_GRAPH_SYSTEM_PROMPT = buildSystemPrompt({
	agentName: "Entity Graph Agent",
	responsibilities: [
		"Entity graph: Entities from uploaded library files are indexed and copied into the campaign after library extraction completes; help users add resources and interpret the graph",
		"Relationship Management: Create relationships between entities in the graph when users mention connections",
		"Entity Type Updates: Update existing entities between types (for example npc to pc) when users request corrections",
		"Community Detection: Analyze entity relationship graphs to identify clusters of related entities using graph algorithms",
	],
	tools: createToolMappingFromObjects(entityGraphTools),
	workflowGuidelines: [
		"Library and campaign files: Direct the user to upload or add library resources to the campaign so entities are extracted from indexed content; do not attempt ad-hoc bulk extraction from chat text",
		"Relationship Creation: When users mention relationships between entities (e.g., 'NPC X lives in Location Y', 'Character A is allied with Character B'), use createEntityRelationshipTool to create the relationship in the graph",
		"Entity Type Updates: When users ask to change an existing entity type (e.g., 'make Madam Eva a player character' or 'change npc to pc'), first find the entity with searchCampaignContext, then call updateEntityTypeTool.",
		"Relationship Queries with Graph Traversal: When users ask questions about entity relationships, use searchCampaignContext iteratively: (1) First, search semantically to find the target entity, (2) Check if initial search results provide sufficient context - only traverse if more information is needed, (3) If traversal is needed, extract the entity ID from results and use traverseFromEntityIds, (4) ALWAYS start with traverseDepth=1 (direct neighbors only) for better performance, (5) ALWAYS use traverseRelationshipTypes filter when possible to reduce traversal scope, (6) Only increase to depth 2 or 3 if depth 1 results are insufficient, (7) Answer using accumulated context. Do NOT use getCommunitiesTool for relationship queries - communities are graph clusters, not entity relationships",
		"Community Detection: When users want to understand how entities cluster or find related groups, use detectCommunitiesTool to analyze the entity graph",
		"Community Analysis: Use getCommunitiesTool or getCommunityHierarchyTool to show users existing communities and their structure (these show graph clusters, not direct entity relationships)",
	],
	importantNotes: [
		"Relationship creation and community tools help refine the entity graph built from library indexing and campaign resources",
		"Before creating relationships, ensure both entities exist in the graph (they usually come from indexed library files added to the campaign)",
		"Use searchCampaignContext with graph traversal to query entity relationships iteratively. First search semantically to find entities, then traverse from their IDs to explore connected entities. Use getCommunitiesTool only for community/cluster analysis, not for relationship queries",
		"If you notice duplicate entities in search results, inform the user and offer to help consolidate them.",
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

	protected getToolsForRole(role: CampaignRole | null): Record<string, any> {
		return isGMRole(role) ? entityGraphTools : {};
	}
}
