import type { AgentActivitySummary } from "@/types/agent-activity";

/**
 * Turning tool arguments and results into something safe and small enough to
 * keep forever.
 *
 * Two constraints drive everything here. First, the arguments reaching a tool
 * are not the arguments the model produced: `BaseAgent.createEnhancedTools`
 * injects the caller's JWT before calling `execute`, so a verbatim copy of the
 * input would write a live credential into a table whose entire purpose is to
 * be displayed. Second, tool results are routinely tens of kilobytes (search
 * hits, entity dumps); storing them would make this table larger than the data
 * it describes.
 *
 * So: drop secrets by key, truncate every value, cap the whole payload.
 */

/**
 * Argument names never written to the log. Matched case-insensitively against
 * the whole key, plus a substring pass for the `*Token` / `*Secret` families,
 * because a tool added tomorrow will not consult this list.
 */
const REDACTED_KEYS = new Set([
	"jwt",
	"token",
	"apikey",
	"api_key",
	"password",
	"secret",
	"authorization",
	"auth",
	"credentials",
	"openaiapikey",
	"anthropicapikey",
]);

const REDACTED_SUBSTRINGS = ["token", "secret", "password", "apikey"];

/** Per-value cap. Long enough to identify a call, short enough to be free. */
const MAX_VALUE_LENGTH = 120;
/** Number of argument keys kept. Tools with more are already unusual. */
const MAX_INPUT_KEYS = 12;
/** Ids kept per kind. A bulk operation's first few are enough to attribute it. */
const MAX_IDS_PER_KIND = 10;
/** Hard cap on the serialized summary. Beyond this the row stops being cheap. */
export const MAX_SUMMARY_BYTES = 2000;

function isRedactedKey(key: string): boolean {
	const lower = key.toLowerCase();
	if (REDACTED_KEYS.has(lower)) return true;
	return REDACTED_SUBSTRINGS.some((fragment) => lower.includes(fragment));
}

function truncate(value: string): string {
	return value.length <= MAX_VALUE_LENGTH
		? value
		: `${value.slice(0, MAX_VALUE_LENGTH)}…`;
}

/** Render one argument value as a short string, whatever its type. */
function stringifyValue(value: unknown): string {
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	if (typeof value === "string") return truncate(value);
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (Array.isArray(value)) {
		return truncate(`[${value.length} item${value.length === 1 ? "" : "s"}]`);
	}
	try {
		return truncate(JSON.stringify(value) ?? "");
	} catch {
		return "[unserializable]";
	}
}

/**
 * Redacted argument map for the log.
 *
 * Redacted keys are kept with a `[redacted]` placeholder rather than dropped:
 * "this call carried a JWT" is useful when reading the log, and silently
 * omitting the key would make an audited action look unauthenticated.
 */
export function summarizeToolInput(args: unknown): Record<string, string> {
	if (!args || typeof args !== "object" || Array.isArray(args)) return {};

	const entries = Object.entries(args as Record<string, unknown>).slice(
		0,
		MAX_INPUT_KEYS
	);

	const out: Record<string, string> = {};
	for (const [key, value] of entries) {
		out[key] = isRedactedKey(key) ? "[redacted]" : stringifyValue(value);
	}
	return out;
}

/** Keys whose values are collected as touched ids, by kind. */
const ID_FIELDS: Array<{
	kind: keyof NonNullable<AgentActivitySummary["touched"]>;
	keys: string[];
}> = [
	{ kind: "entityIds", keys: ["id", "entityId", "entityIds"] },
	{ kind: "fileKeys", keys: ["fileKey", "fileKeys", "file_key"] },
	{ kind: "campaignIds", keys: ["campaignId", "campaign_id"] },
	{ kind: "shardIds", keys: ["shardId", "shardIds", "shard_id"] },
];

/** How deep into a result object to look for ids before giving up. */
const MAX_SCAN_DEPTH = 4;
/** Objects visited per scan. Bounds the cost on a large search result. */
const MAX_SCAN_NODES = 400;

/**
 * Walk a tool result collecting the ids it mentions.
 *
 * Deliberately a heuristic over field names rather than a per-tool contract:
 * the point of writing from the shared wrapper is that no tool has to opt in,
 * and a per-tool mapping would be exactly the per-agent instrumentation this
 * primitive exists to avoid. Missing an id costs a dimmer badge in the UI;
 * requiring 200 tools to declare their outputs costs the feature.
 */
export function collectTouchedIds(
	value: unknown
): AgentActivitySummary["touched"] {
	const found = new Map<string, Set<string>>();
	let visited = 0;

	const push = (kind: string, id: unknown) => {
		if (typeof id !== "string" || !id) return;
		const set = found.get(kind) ?? new Set<string>();
		if (set.size >= MAX_IDS_PER_KIND) return;
		set.add(truncate(id));
		found.set(kind, set);
	};

	const walk = (node: unknown, depth: number): void => {
		if (depth > MAX_SCAN_DEPTH || visited >= MAX_SCAN_NODES) return;
		if (!node || typeof node !== "object") return;
		visited += 1;

		if (Array.isArray(node)) {
			for (const item of node) walk(item, depth + 1);
			return;
		}

		const record = node as Record<string, unknown>;
		for (const { kind, keys } of ID_FIELDS) {
			for (const key of keys) {
				const raw = record[key];
				if (Array.isArray(raw)) {
					for (const item of raw) push(kind, item);
				} else {
					push(kind, raw);
				}
			}
		}

		for (const child of Object.values(record)) walk(child, depth + 1);
	};

	walk(value, 0);

	if (found.size === 0) return undefined;
	const touched: Record<string, string[]> = {};
	for (const [kind, ids] of found) touched[kind] = [...ids];
	return touched as AgentActivitySummary["touched"];
}

/** The tool's own message, when its result carries one. */
function extractMessage(result: unknown): string | undefined {
	if (!result || typeof result !== "object") return undefined;
	const envelope = result as Record<string, unknown>;
	const inner = envelope.result;
	const source =
		inner && typeof inner === "object"
			? (inner as Record<string, unknown>)
			: envelope;
	const message = source.message;
	return typeof message === "string" && message ? truncate(message) : undefined;
}

/**
 * Merge the start-time input summary with what the result revealed.
 *
 * Applied at finish rather than replacing the start summary, so a row that is
 * read while still running already says what it was asked to do.
 */
export function summarizeToolResult(
	result: unknown,
	base?: AgentActivitySummary | null
): AgentActivitySummary {
	const summary: AgentActivitySummary = { ...(base ?? {}) };

	const touched = collectTouchedIds(result);
	if (touched) {
		summary.touched = { ...(summary.touched ?? {}), ...touched };
	}

	const message = extractMessage(result);
	if (message) summary.message = message;

	return summary;
}

/**
 * Serialize a summary for storage, shedding detail until it fits.
 *
 * The cap has to hold even against a pathological single argument, so the
 * fallback drops the input map entirely rather than returning something over
 * budget. A truncated JSON string is not an option — the read path parses it.
 */
export function serializeSummary(
	summary: AgentActivitySummary | null | undefined
): string | null {
	if (!summary) return null;

	const attempts: AgentActivitySummary[] = [
		summary,
		{ touched: summary.touched, message: summary.message },
		{ message: summary.message },
	];

	for (const attempt of attempts) {
		const json = JSON.stringify(attempt);
		if (json && json.length <= MAX_SUMMARY_BYTES) return json;
	}
	return null;
}

/** Parse a stored summary, treating anything malformed as absent. */
export function parseSummary(raw: string | null): AgentActivitySummary | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object"
			? (parsed as AgentActivitySummary)
			: null;
	} catch {
		return null;
	}
}
