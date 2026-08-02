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
 * | audio_ambience | Generated scene ambience (per second of audio, not tokens) |
 * | audio_sfx | Generated one-shot sound effects (per second) |
 * | audio_music | Generated campaign/faction theme music (per second) |
 * | audio_voice | NPC voice and creature vocalization TTS (per second) |
 *
 * The four `audio_*` intents share this vocabulary so audio lands in the same
 * per-intent cost view as everything else, but they are metered in SECONDS of
 * output rather than tokens — see `logVerboseAudioSpend` in
 * `src/lib/llm-usage-verbose-log.ts`. Do not add them to token-based totals.
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
	audio_ambience: "audio_ambience",
	audio_sfx: "audio_sfx",
	audio_music: "audio_music",
	audio_voice: "audio_voice",
} as const;

export type LlmSpendIntent =
	(typeof LLM_SPEND_INTENT)[keyof typeof LLM_SPEND_INTENT];

/**
 * Map an audio kind onto its spend intent.
 *
 * Creature vocalizations bill as `audio_voice` regardless of which provider
 * serves them, because the cost line the user cares about is "sounds coming out
 * of a mouth", not which model happened to make it.
 */
export const AUDIO_KIND_SPEND_INTENT = {
	ambience: LLM_SPEND_INTENT.audio_ambience,
	sfx: LLM_SPEND_INTENT.audio_sfx,
	music: LLM_SPEND_INTENT.audio_music,
	voice: LLM_SPEND_INTENT.audio_voice,
	creature: LLM_SPEND_INTENT.audio_voice,
} as const satisfies Record<string, LlmSpendIntent>;

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
	// Routing runs before the answering agent on every message, so the user is
	// blocked on it. Counting it as pipeline would hide the routing tax in the
	// background bucket, which is the opposite of what #736 needs to watch.
	LLM_SPEND_INTENT.agent_routing,
]);

export function surfaceForIntent(intent: LlmSpendIntent): LlmSpendSurface {
	return INTERACTIVE_INTENTS.has(intent)
		? LLM_SPEND_SURFACE.interactive
		: LLM_SPEND_SURFACE.pipeline;
}
