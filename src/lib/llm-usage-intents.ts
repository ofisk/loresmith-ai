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
} as const;

export type LlmSpendIntent =
	(typeof LLM_SPEND_INTENT)[keyof typeof LLM_SPEND_INTENT];
