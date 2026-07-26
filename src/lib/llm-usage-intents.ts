/**
 * Controlled vocabulary for verbose LLM token spend logs (`intent` field).
 * Add new values here only — keeps Cloudflare log drains grepable.
 *
 * | Intent | Typical triggers |
 * |--------|------------------|
 * | user_prompt | Chat / agent completion |
 * | entity_extraction | Entity extraction / chunk gate |
 * | graph_rebuild | GraphRAG / shard field generation |
 * | graph_visualization | Graph visualization embeddings / search |
 * | shard_embedding | Shard embedding queue |
 * | visual_inspiration_title | Visual asset title LLM |
 * | character_sheet_detection | Character sheet detect pass |
 * | embedding_index | File embedding (Vectorize indexing path) |
 * | vision_image_extract | Vision image description for extraction |
 * | session_plan_readout | Session plan readout (stitch / single-shot plan LLM) |
 * | conversation_summary | Rolling summarization of older chat turns |
 * | agent_routing | Agent selection classifier (per-message routing tax) |
 */
export const LLM_SPEND_INTENT = {
	user_prompt: "user_prompt",
	entity_extraction: "entity_extraction",
	graph_rebuild: "graph_rebuild",
	graph_visualization: "graph_visualization",
	shard_embedding: "shard_embedding",
	visual_inspiration_title: "visual_inspiration_title",
	character_sheet_detection: "character_sheet_detection",
	embedding_index: "embedding_index",
	vision_image_extract: "vision_image_extract",
	session_plan_readout: "session_plan_readout",
	conversation_summary: "conversation_summary",
	agent_routing: "agent_routing",
} as const;

export type LlmSpendIntent =
	(typeof LLM_SPEND_INTENT)[keyof typeof LLM_SPEND_INTENT];

/**
 * Whether spend blocks a user (`interactive`) or runs in the background
 * (`pipeline`). Splitting spend this way separates "latency the user feels" from
 * "cost of keeping the index warm" — the two justify very different budgets.
 */
export const LLM_SPEND_SURFACE = {
	interactive: "interactive",
	pipeline: "pipeline",
} as const;

export type LlmSpendSurface =
	(typeof LLM_SPEND_SURFACE)[keyof typeof LLM_SPEND_SURFACE];

/**
 * Intents a user is actively waiting on. Everything else is background work
 * driven by the indexing queue, so the map only lists the interactive ones.
 */
const INTERACTIVE_INTENTS = new Set<LlmSpendIntent>([
	LLM_SPEND_INTENT.user_prompt,
	// Summarisation runs inside the user's chat turn, so its latency and cost
	// land on that turn even though the user never asked for it directly.
	LLM_SPEND_INTENT.conversation_summary,
	LLM_SPEND_INTENT.session_plan_readout,
	LLM_SPEND_INTENT.graph_visualization,
]);

export function surfaceForIntent(intent: LlmSpendIntent): LlmSpendSurface {
	return INTERACTIVE_INTENTS.has(intent)
		? LLM_SPEND_SURFACE.interactive
		: LLM_SPEND_SURFACE.pipeline;
}
