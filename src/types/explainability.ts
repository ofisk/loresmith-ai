/**
 * Context source from tool results (searchCampaignContext, etc.)
 */
export interface ContextSource {
	type: "entity" | "planning_context" | "file_content";
	source:
		| "entity_graph"
		| "session_digest"
		| "original_file"
		| "graph_traversal";
	id?: string;
	title?: string;
	entityType?: string;
	sessionNumber?: number;
	sectionType?: string;
}

/**
 * Explainability metadata attached to assistant messages.
 * Surfaces which campaign context influenced the response.
 */
export interface Explainability {
	rationale: string;
	contextSources: ContextSource[];
	toolsUsed?: string[];
}
