import { isSemanticScore } from "@/tools/campaign-context/search-tools-result-shaping";
import type {
	ContextSource,
	Explainability,
	GroundingLevel,
} from "@/types/explainability";
import {
	MAX_CONTEXT_SOURCES,
	WEAK_GROUNDING_SCORE_THRESHOLD,
} from "@/types/explainability";

/**
 * Step shape from AI SDK streamText onFinish args.
 *
 * `output` is deliberately `unknown`: the SDK stores whatever `execute`
 * returned and types it as such, so its shape is narrowed at runtime in
 * `unwrapToolData` rather than asserted here. Declaring a concrete shape is
 * what let the original bug compile — it read a `result` property the SDK
 * never sets, which TypeScript accepted as a merely-absent optional field.
 */
interface StreamStep {
	toolCalls?: Array<{ toolCallId?: string; toolName: string; args?: unknown }>;
	toolResults?: Array<{
		toolCallId?: string;
		toolName?: string;
		output?: unknown;
		/** Only set by callers that already unwrapped the SDK envelope. */
		result?: unknown;
	}>;
}

/**
 * Tools whose use means the agent went looking for grounding in the user's
 * materials. When one of these runs we always emit explainability — including
 * when it came back empty, so an unsourced answer is visibly unsourced.
 */
const RETRIEVAL_TOOL_NAMES = new Set([
	"searchCampaignContext",
	"listAllEntities",
	"getDocumentContent",
	"searchRulesTool",
	"lookupStatBlockTool",
]);

/** Longest excerpt carried per source; the UI clamps further. */
const MAX_SNIPPET_LENGTH = 280;

/**
 * The search tools wrap entity content in an instruction banner for the model.
 * Snippets should show the content, not the banner.
 */
const ENTITY_CONTENT_MARKER =
	"ENTITY CONTENT (may contain unverified mentions):";

/**
 * World-state changelog data is appended to entity text *before* the player
 * sanitizer runs, so it must never reach a user-visible snippet.
 */
const WORLD_STATE_MARKER = "WORLD STATE UPDATES (FROM CHANGELOG)";

/** Content keys most likely to hold prose worth showing. */
const READABLE_CONTENT_KEYS = [
	"description",
	"summary",
	"text",
	"content",
	"overview",
	"details",
	"notes",
];

function truncate(text: string, max = MAX_SNIPPET_LENGTH): string {
	const collapsed = text.replace(/\s+/g, " ").trim();
	if (collapsed.length <= max) return collapsed;
	return `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Entity content reaches the tool result as a JSON blob. Pull the most
 * readable prose out of it rather than showing raw JSON to the user.
 */
function readableFromSerializedContent(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return trimmed;

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return trimmed;
	}
	if (typeof parsed === "string") return parsed;
	if (!parsed || typeof parsed !== "object") return trimmed;

	const record = parsed as Record<string, unknown>;
	for (const key of READABLE_CONTENT_KEYS) {
		const value = record[key];
		if (typeof value === "string" && value.trim().length > 0) return value;
	}

	const strings = Object.values(record).filter(
		(v): v is string => typeof v === "string" && v.trim().length > 0
	);
	return strings.length > 0 ? strings.join(" · ") : trimmed;
}

/** Strips the model-facing banners and returns a user-readable excerpt. */
function extractSnippet(text: unknown, type: string): string | undefined {
	if (typeof text !== "string" || text.trim().length === 0) return undefined;

	if (type !== "entity") return truncate(text);

	// Drop the changelog block first — it is unsanitized for player roles.
	const worldStateIndex = text.indexOf(WORLD_STATE_MARKER);
	const withoutWorldState =
		worldStateIndex >= 0 ? text.slice(0, worldStateIndex) : text;

	const markerIndex = withoutWorldState.indexOf(ENTITY_CONTENT_MARKER);
	const body =
		markerIndex >= 0
			? withoutWorldState.slice(markerIndex + ENTITY_CONTENT_MARKER.length)
			: withoutWorldState;

	// Whatever remains is fenced by the divider rules that close the content
	// banner and open the block that followed it.
	const content = body.replace(/^[\s═]+/, "").replace(/[\s═]+$/, "");
	if (content.length === 0) return undefined;
	return truncate(readableFromSerializedContent(content));
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

/**
 * Extract context sources from searchCampaignContext tool result.
 */
function extractContextSourcesFromSearchResults(
	results: unknown[]
): ContextSource[] {
	const sources: ContextSource[] = [];
	for (const r of results) {
		const item = r as Record<string, unknown>;
		const type = item.type as string | undefined;
		const source = item.source as string | undefined;
		if (!type || !source) continue;

		const cs: ContextSource = {
			type: type as ContextSource["type"],
			source: source as ContextSource["source"],
		};
		cs.entityType = asString(item.entityType);
		cs.sessionNumber = asNumber(item.sessionNumber);
		cs.sessionDate = asString(item.sessionDate);
		cs.sectionType = asString(item.sectionType);
		cs.traversalDepth = asNumber(item.traversalDepth);

		// Use type-specific fields to avoid overwriting: entities key on entityId,
		// digest sections on digestId, file chunks on fileKey.
		if (type === "file_content") {
			cs.id = asString(item.fileKey);
			cs.fileKey = asString(item.fileKey);
			cs.chunkIndex = asNumber(item.chunkIndex);
			cs.title = asString(item.fileName) ?? asString(item.title);
		} else if (type === "planning_context") {
			cs.id = asString(item.digestId);
			cs.title = asString(item.title);
		} else {
			cs.id = asString(item.entityId);
			cs.title = asString(item.title);
		}

		const score = asNumber(item.score);
		if (score !== undefined) {
			cs.score = score;
			// Traversal and lexical chunk matches carry arithmetic placeholders,
			// not similarities — never present those as relevance.
			cs.scoreIsSemantic =
				source !== "graph_traversal" &&
				source !== "original_file" &&
				isSemanticScore(score);
		}

		cs.snippet = extractSnippet(item.text, type);

		sources.push(cs);
	}
	return sources;
}

/**
 * listAllEntities returns raw entity rows rather than search hits: `type` is
 * the entity type ("npc"), there is no `source`, and every row carries a
 * placeholder score of 1.0. Map them onto entity sources with no semantic
 * score, so a listing-backed answer reads as weakly grounded rather than as a
 * wall of perfect matches.
 */
function extractContextSourcesFromEntityList(
	results: unknown[]
): ContextSource[] {
	const sources: ContextSource[] = [];
	for (const r of results) {
		const item = (r ?? {}) as Record<string, unknown>;
		const id = asString(item.id);
		const title = asString(item.title) ?? asString(item.name);
		if (!id && !title) continue;

		sources.push({
			type: "entity",
			source: "entity_graph",
			id,
			title,
			entityType: asString(item.type),
			snippet: extractSnippet(item.text, "entity"),
		});
	}
	return sources;
}

/** getDocumentContent returns whole-document chunks for a single file. */
function extractContextSourcesFromDocumentContent(
	data: Record<string, unknown>
): ContextSource[] {
	const chunks = data.chunks;
	if (!Array.isArray(chunks)) return [];

	const fileKey = asString(data.fileKey);
	const fileName =
		asString(data.displayName) ?? asString(data.fileName) ?? "Document";

	return chunks.map((chunk) => {
		const c = (chunk ?? {}) as Record<string, unknown>;
		return {
			type: "file_content" as const,
			source: "original_file" as const,
			id: fileKey,
			fileKey,
			chunkIndex: asNumber(c.index),
			title: fileName,
			snippet: extractSnippet(c.text, "file_content"),
		};
	});
}

/** Rules tools already produce citations; map them onto the same shape. */
function extractContextSourcesFromRulesResults(
	results: unknown[]
): ContextSource[] {
	const sources: ContextSource[] = [];
	for (const r of results) {
		const item = (r ?? {}) as Record<string, unknown>;
		const citation = (item.citation ?? {}) as Record<string, unknown>;
		const score = asNumber(item.score);
		sources.push({
			type: "file_content",
			source: "original_file",
			id: asString(citation.fileKey) ?? asString(item.id),
			fileKey: asString(citation.fileKey),
			chunkIndex: asNumber(citation.chunkIndex),
			title: asString(item.title) ?? asString(citation.source) ?? "Rules",
			snippet: extractSnippet(item.excerpt, "file_content"),
			score,
			scoreIsSemantic: score !== undefined,
		});
	}
	return sources;
}

/**
 * The same entity or chunk is commonly returned by several searches in one
 * turn. Collapse duplicates, keeping the best-scoring copy.
 */
function sourceKey(source: ContextSource): string {
	const identity = source.id ?? source.title ?? "";
	const chunk = source.chunkIndex ?? "";
	const section = source.sectionType ?? "";
	return `${source.type}|${identity}|${chunk}|${section}`;
}

function dedupeSources(sources: ContextSource[]): ContextSource[] {
	const byKey = new Map<string, ContextSource>();
	for (const source of sources) {
		const key = sourceKey(source);
		const existing = byKey.get(key);
		if (!existing || scoreOf(source) > scoreOf(existing)) {
			byKey.set(key, source);
		}
	}
	return [...byKey.values()];
}

function scoreOf(source: ContextSource): number {
	return source.score ?? 0;
}

function determineGrounding(
	sources: ContextSource[],
	topSemanticScore: number | undefined
): GroundingLevel {
	if (sources.length === 0) return "ungrounded";
	// No semantic score anywhere means every hit came from a fallback path
	// (name match, traversal, lexical scan) — real, but not a strong signal.
	if (topSemanticScore === undefined) return "weak";
	return topSemanticScore >= WEAK_GROUNDING_SCORE_THRESHOLD
		? "grounded"
		: "weak";
}

function buildRationale(
	sources: ContextSource[],
	grounding: GroundingLevel
): string {
	if (grounding === "ungrounded") {
		return "No matching campaign context was found, so this answer is not grounded in your materials.";
	}

	const entityCount = sources.filter((s) => s.type === "entity").length;
	const planningCount = sources.filter(
		(s) => s.type === "planning_context"
	).length;
	const fileCount = sources.filter((s) => s.type === "file_content").length;

	const parts: string[] = [];
	if (entityCount > 0)
		parts.push(`${entityCount} entit${entityCount === 1 ? "y" : "ies"}`);
	if (planningCount > 0)
		parts.push(
			`${planningCount} session digest section${planningCount === 1 ? "" : "s"}`
		);
	if (fileCount > 0)
		parts.push(`${fileCount} file excerpt${fileCount === 1 ? "" : "s"}`);

	if (parts.length === 0) return "Based on tools used during this response.";

	const base = `Based on ${parts.join(", ")} from your campaign.`;
	return grounding === "weak"
		? `${base} Nothing matched the question strongly — check the sources before relying on this.`
		: base;
}

/** Routes one tool result to the extractor that understands its shape. */
function extractSourcesForTool(
	toolName: string,
	data: Record<string, unknown>
): ContextSource[] {
	const results = data.results;
	if (toolName === "getDocumentContent") {
		return extractContextSourcesFromDocumentContent(data);
	}
	if (!Array.isArray(results)) return [];
	if (toolName === "searchCampaignContext") {
		return extractContextSourcesFromSearchResults(results);
	}
	if (toolName === "listAllEntities") {
		return extractContextSourcesFromEntityList(results);
	}
	if (toolName === "searchRulesTool" || toolName === "lookupStatBlockTool") {
		return extractContextSourcesFromRulesResults(results);
	}
	return [];
}

/** Everything the step walk gathers before scoring and truncation. */
interface HarvestedSteps {
	rawSources: ContextSource[];
	toolsUsed: string[];
	retrievalAttempted: boolean;
}

type ToolResultEntry = NonNullable<StreamStep["toolResults"]>[number];

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

/**
 * Dig the tool's `{ success, data }` payload out of an SDK tool result.
 *
 * The AI SDK stores whatever `execute` returned under `output`, and our tools
 * return the `{ toolCallId, result }` envelope from `createToolSuccess` — so
 * the payload sits at `output.result.data`. The shallower shapes are accepted
 * too, for tools that return a bare envelope and for callers that hand us an
 * already-unwrapped result.
 */
function unwrapToolData(
	entry: ToolResultEntry | undefined
): Record<string, unknown> | undefined {
	const record = asRecord(entry);
	if (!record) return undefined;

	const envelope = asRecord(record.output) ?? record;
	const inner = asRecord(envelope.result) ?? envelope;
	return asRecord(inner.data);
}

/**
 * Pair a call with its result. Ids are authoritative — within a step, a tool
 * that threw produces a `tool-error` part and no entry in `toolResults`, so a
 * positional match would silently attribute one tool's results to another.
 * Positional matching stays as the fallback for results that carry no id.
 */
function findResultForCall(
	toolResults: ToolResultEntry[],
	toolCallId: string | undefined,
	toolName: string,
	index: number
): ToolResultEntry | undefined {
	if (toolCallId) {
		const byId = toolResults.find((r) => r?.toolCallId === toolCallId);
		if (byId) return byId;
	}
	const positional = toolResults[index];
	if (positional && (positional.toolName ?? toolName) === toolName) {
		return positional;
	}
	return toolResults.find((r) => r?.toolName === toolName);
}

function harvestSteps(steps: StreamStep[]): HarvestedSteps {
	const rawSources: ContextSource[] = [];
	const toolsUsed: string[] = [];
	let retrievalAttempted = false;

	for (const step of steps) {
		const toolCalls = step.toolCalls ?? [];
		const toolResults = step.toolResults ?? [];

		for (let i = 0; i < toolCalls.length; i++) {
			const call = toolCalls[i];
			const toolName = call?.toolName;
			if (!toolName) continue;

			toolsUsed.push(toolName);
			if (RETRIEVAL_TOOL_NAMES.has(toolName)) retrievalAttempted = true;

			const data = unwrapToolData(
				findResultForCall(toolResults, call?.toolCallId, toolName, i)
			);
			if (data) rawSources.push(...extractSourcesForTool(toolName, data));
		}
	}

	return { rawSources, toolsUsed, retrievalAttempted };
}

/**
 * Build explainability metadata from streamText onFinish steps.
 * Returns null when the agent never attempted retrieval; when it did, always
 * returns a result so an ungrounded answer is labelled as such.
 */
export function buildExplainabilityFromSteps(
	steps: StreamStep[] | undefined
): Explainability | null {
	if (!steps || steps.length === 0) return null;

	const { rawSources, toolsUsed, retrievalAttempted } = harvestSteps(steps);

	// Nothing was retrieved and nothing tried to be: stay silent rather than
	// stamping "ungrounded" on greetings and pure action turns.
	if (!retrievalAttempted && rawSources.length === 0) return null;

	const deduped = dedupeSources(rawSources);
	const semanticScores = deduped.filter((s) => s.scoreIsSemantic).map(scoreOf);
	const topScore =
		semanticScores.length > 0 ? Math.max(...semanticScores) : undefined;

	// Multi-hop traversal can touch a lot of entities; carry the top slice.
	deduped.sort((a, b) => scoreOf(b) - scoreOf(a));
	const contextSources = deduped.slice(0, MAX_CONTEXT_SOURCES);

	const grounding = determineGrounding(deduped, topScore);

	return {
		rationale: buildRationale(contextSources, grounding),
		contextSources,
		toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
		grounding,
		totalSourceCount: deduped.length,
		topScore,
		// Stable handle so a context-accuracy rating can be joined back to the
		// exact sources the user was looking at when they rated it.
		queryId: crypto.randomUUID(),
	};
}
