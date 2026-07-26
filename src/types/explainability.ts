/**
 * Context source from tool results (searchCampaignContext, etc.)
 *
 * One entry per retrieved chunk/entity/digest section that reached the model.
 * Everything here is derived from tool results that have already passed the
 * role-based sanitizers in the search tools, so a player never sees a GM-only
 * source in this list.
 */
export interface ContextSource {
	type: "entity" | "planning_context" | "file_content";
	source:
		| "entity_graph"
		| "session_digest"
		| "original_file"
		| "graph_traversal";
	/** entityId for entities, digestId for digest sections, fileKey for chunks. */
	id?: string;
	title?: string;
	entityType?: string;
	sessionNumber?: number;
	/** ISO date of the session a digest section came from, when known. */
	sessionDate?: string;
	sectionType?: string;
	/** Short excerpt of the retrieved text, for "what did it actually read". */
	snippet?: string;
	/** Retrieval score in [0,1]. Absent when the path assigned no score. */
	score?: number;
	/**
	 * True when `score` is a real semantic similarity rather than one of the
	 * fixed placeholders the non-semantic paths assign. Without this a lexical
	 * chunk match (hardcoded 1.0) would read as a perfect semantic hit.
	 */
	scoreIsSemantic?: boolean;
	/** File provenance, present on file_content sources. */
	fileKey?: string;
	chunkIndex?: number;
	/** Hops from the seed entity, present on graph_traversal sources. */
	traversalDepth?: number;
}

/**
 * How well the response was anchored in retrieved campaign context.
 *
 * - `grounded`   — retrieval returned sources with a strong semantic match
 * - `weak`       — sources came back, but nothing matched the query strongly
 * - `ungrounded` — retrieval ran and found nothing; the answer is unsourced
 */
export type GroundingLevel = "grounded" | "weak" | "ungrounded";

/** Below this top score, retrieval is reported as a weak match. */
export const WEAK_GROUNDING_SCORE_THRESHOLD = 0.5;

/** Sources kept per message; the rest are counted but not carried. */
export const MAX_CONTEXT_SOURCES = 24;

/**
 * Explainability metadata attached to assistant messages.
 * Surfaces which campaign context influenced the response.
 */
export interface Explainability {
	rationale: string;
	contextSources: ContextSource[];
	toolsUsed?: string[];
	/** Present whenever a retrieval tool ran. */
	grounding?: GroundingLevel;
	/** Sources found before truncation to MAX_CONTEXT_SOURCES. */
	totalSourceCount?: number;
	/** Best semantic score across sources, when any path produced one. */
	topScore?: number;
	/**
	 * Stable id for this retrieval, so a context-accuracy rating can be joined
	 * back to the exact sources the user was looking at when they rated it.
	 */
	queryId?: string;
}
