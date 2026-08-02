/**
 * Builds tool-call receipts — the "what did the agent actually run" record
 * rendered under an assistant reply.
 *
 * Both entry points funnel into one builder over a normalised call list:
 *
 * - `buildToolReceiptsFromSteps` runs server-side in `streamText`'s `onFinish`,
 *   so the receipt is persisted with the message and survives a reload.
 * - `buildToolReceiptsFromParts` runs client-side over the streamed message
 *   parts, so the receipt appears the moment the turn ends rather than after
 *   the history round trip.
 *
 * Keeping one builder means the live and durable receipts can never disagree.
 */
import { getToolPartInfo, isToolPart } from "@/lib/tool-part-utils";
import type {
	ToolEffect,
	ToolOutcomeStatus,
	ToolReceipt,
	ToolReceiptEntity,
	ToolReceipts,
} from "@/types/tool-receipt";
import {
	MAX_RECEIPT_CALLS,
	MAX_RECEIPT_TEXT_LENGTH,
} from "@/types/tool-receipt";

/** One tool call, flattened out of whichever source it came from. */
export interface ToolCallRecord {
	toolName: string;
	input?: unknown;
	/** The SDK's stored return value: `{ toolCallId, result: {...} }`. */
	output?: unknown;
	/** Set when the SDK reported a thrown tool error rather than a result. */
	errorText?: string;
	/** True when the call produced no result at all (it threw). */
	threw?: boolean;
}

/**
 * Step shape from AI SDK `streamText` `onFinish` args. Mirrors the narrow
 * declaration in explainability-builder: `output` stays `unknown` because the
 * SDK stores whatever `execute` returned and narrowing happens at runtime.
 */
interface StreamStep {
	toolCalls?: Array<{ toolCallId?: string; toolName: string; input?: unknown }>;
	toolResults?: Array<{
		toolCallId?: string;
		toolName?: string;
		output?: unknown;
	}>;
}

/**
 * Verbs that reliably mean "looked something up". A new `listWidgets` tool is
 * classified correctly the day it lands, without touching this file.
 */
const READ_PREFIXES = [
	"analyze",
	"assess",
	"check",
	"describe",
	"fetch",
	"find",
	"get",
	"list",
	"lookup",
	"provide",
	"query",
	"read",
	"recommend",
	"search",
	"show",
	"suggest",
	"view",
];

/** Verbs that reliably mean "changed something". */
const WRITE_PREFIXES = [
	"add",
	"apply",
	"approve",
	"archive",
	"assign",
	"capture",
	"complete",
	"create",
	"define",
	"delete",
	"import",
	"link",
	"process",
	"propose",
	"record",
	"reject",
	"remove",
	"rename",
	"save",
	"set",
	"store",
	"submit",
	"track",
	"update",
	"upload",
];

/**
 * Tools whose verb lies. Each entry is checked against the tool's own
 * description, not guessed from the name — `resolveRulesConflictTool` only
 * reports precedence, while `resolveContinuityFindingTool` writes corrections
 * back to world state.
 */
const EFFECT_OVERRIDES: Record<string, ToolEffect> = {
	exportHandoutTool: "write",
	noOpTool: "action",
	resolveCampaignIdentifier: "read",
	resolveContinuityFindingTool: "write",
	resolveRulesConflictTool: "read",
};

/**
 * Argument names worth showing, best first. Anything not listed falls back to
 * the first short string argument, so an unrecognised tool still says
 * something rather than rendering a bare name.
 */
const DETAIL_KEYS = [
	"query",
	"searchQuery",
	"question",
	"entityName",
	"characterName",
	"campaignName",
	"fileName",
	"displayName",
	"name",
	"title",
	"taskTitle",
	"relationshipType",
	"eventDescription",
	"topic",
	"term",
	"entityType",
	"description",
];

/** Never shown: secrets, and ids that read as noise to a user. */
const DETAIL_SKIP_KEYS = new Set([
	"jwt",
	"campaignId",
	"sessionId",
	"toolCallId",
	"username",
	"userId",
]);

/**
 * Result arrays worth counting, with the noun the UI says. Plurals are spelled
 * out rather than derived — "entities" does not survive a suffix-stripping
 * rule, and a receipt that reads "1 entiti" undermines the trust it exists to
 * build.
 */
const COUNTABLE_RESULT_KEYS: Array<
	[key: string, singular: string, plural: string]
> = [
	["results", "match", "matches"],
	["entities", "entity", "entities"],
	["relationships", "relationship", "relationships"],
	["campaigns", "campaign", "campaigns"],
	["files", "file", "files"],
	["resources", "resource", "resources"],
	["chunks", "excerpt", "excerpts"],
	["tasks", "task", "tasks"],
	["digests", "digest", "digests"],
	["findings", "finding", "findings"],
	["events", "event", "events"],
	["communities", "community", "communities"],
	["messages", "message", "messages"],
	["suggestions", "suggestion", "suggestions"],
];

/** Entities shown per row before the rest are dropped. */
const MAX_ENTITIES_PER_RECEIPT = 6;

function truncate(text: string, max = MAX_RECEIPT_TEXT_LENGTH): string {
	const collapsed = text.replace(/\s+/g, " ").trim();
	if (collapsed.length <= max) return collapsed;
	return `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

/** `updateEntityWorldStateTool` → "Update entity world state". */
export function humanizeToolName(toolName: string): string {
	const words = toolName
		.replace(/Tool$/, "")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		// Keep acronyms whole: "generateGMContext" → "generate GM Context".
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		// Sentence case, not Title Case — a receipt row is a description of what
		// ran, not a heading. Acronyms keep their capitals.
		.map((word) => (/^[A-Z]{2,}$/.test(word) ? word : word.toLowerCase()));

	if (words.length === 0) return toolName;
	const [first, ...rest] = words;
	return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}

/**
 * Classify a tool as read, write, or "we won't claim".
 *
 * Unrecognised verbs deliberately land on `action`: a tool wrongly labelled
 * "nothing changed" is a worse failure than one labelled ambiguously, and this
 * list cannot stay ahead of every tool anyone adds.
 */
export function classifyToolEffect(toolName: string): ToolEffect {
	const override = EFFECT_OVERRIDES[toolName];
	if (override) return override;

	const lower = toolName.toLowerCase();
	if (WRITE_PREFIXES.some((prefix) => lower.startsWith(prefix))) return "write";
	if (READ_PREFIXES.some((prefix) => lower.startsWith(prefix))) return "read";
	return "action";
}

/**
 * Dig the `{ success, message, data }` payload out of an SDK tool result.
 * `base-agent` normalises every tool return into a `{ toolCallId, result }`
 * envelope, and the SDK stores that under `output` — so the payload sits at
 * `output.result`. Shallower shapes are accepted for callers that already
 * unwrapped it.
 */
function unwrapToolResult(
	output: unknown
): Record<string, unknown> | undefined {
	const envelope = asRecord(output);
	if (!envelope) return undefined;
	return asRecord(envelope.result) ?? envelope;
}

/** What the call was made with. */
function summarizeInput(input: unknown): string | undefined {
	const record = asRecord(input);
	if (!record) return undefined;

	// A relationship call is about the link, not either endpoint's id.
	if (record.fromEntityId && record.toEntityId) {
		const type = asNonEmptyString(record.relationshipType);
		return type ? truncate(type.replace(/_/g, " ")) : undefined;
	}

	for (const key of DETAIL_KEYS) {
		const value = record[key];
		const asString = asNonEmptyString(value);
		if (asString) return truncate(asString);
		if (typeof value === "number" && Number.isFinite(value)) {
			return `${key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()} ${value}`;
		}
	}

	for (const [key, value] of Object.entries(record)) {
		if (DETAIL_SKIP_KEYS.has(key) || key.endsWith("Id") || key.endsWith("Key"))
			continue;
		const asString = asNonEmptyString(value);
		if (asString && asString.length <= 80) return truncate(asString);
	}
	return undefined;
}

/** First countable array in the result payload, as "3 matches" / "no matches". */
function summarizeCount(data: Record<string, unknown>): string | undefined {
	for (const [key, singular, plural] of COUNTABLE_RESULT_KEYS) {
		const value = data[key];
		if (!Array.isArray(value)) continue;
		if (value.length === 0) return `no ${plural}`;
		return `${value.length} ${value.length === 1 ? singular : plural}`;
	}
	return undefined;
}

function pushEntity(
	into: ToolReceiptEntity[],
	id: unknown,
	name: unknown
): void {
	const entityId = asNonEmptyString(id);
	const entityName = asNonEmptyString(name);
	// Both halves are required: an id with no name renders as a UUID, and a
	// name with no id would be a dead link.
	if (!entityId || !entityName) return;
	if (into.some((e) => e.id === entityId)) return;
	into.push({ id: entityId, name: truncate(entityName, 80) });
}

/**
 * Entities the call *touched*, not everything it read. Search hits are already
 * listed by the Sources panel; repeating them here would bury the one line
 * that matters ("it created this NPC").
 */
function extractEntities(
	input: unknown,
	data: Record<string, unknown> | undefined
): ToolReceiptEntity[] {
	const entities: ToolReceiptEntity[] = [];
	const inputRecord = asRecord(input);

	if (data) {
		const single = asRecord(data.entity);
		if (single) pushEntity(entities, single.id ?? single.entityId, single.name);
		pushEntity(entities, data.entityId, data.entityName ?? data.name);
		if (Array.isArray(data.entities)) {
			for (const raw of data.entities) {
				const item = asRecord(raw);
				if (item) pushEntity(entities, item.id ?? item.entityId, item.name);
			}
		}
	}

	if (inputRecord) {
		pushEntity(entities, inputRecord.entityId, inputRecord.entityName);
	}

	return entities.slice(0, MAX_ENTITIES_PER_RECEIPT);
}

interface CallOutcome {
	status: ToolOutcomeStatus;
	outcome?: string;
	data?: Record<string, unknown>;
}

const FAILED_OUTCOME = "Tool call failed";

/** A failure always says something, even when the tool gave us nothing to say. */
function failureOutcome(
	message: string | undefined,
	data: Record<string, unknown> | undefined
): CallOutcome {
	const error = data ? asNonEmptyString(data.error) : undefined;
	return {
		status: "error",
		outcome: truncate(message ?? error ?? FAILED_OUTCOME),
		data,
	};
}

/**
 * A read is best summarised by how much it found; a write by what it did. Both
 * fall back to the other so a row is never left with a bare tool name.
 */
function successOutcome(
	effect: ToolEffect,
	message: string | undefined,
	data: Record<string, unknown> | undefined
): CallOutcome {
	const count = data ? summarizeCount(data) : undefined;
	const outcome = effect === "read" ? (count ?? message) : (message ?? count);
	return {
		status: "ok",
		outcome: outcome ? truncate(outcome) : undefined,
		data,
	};
}

/** What came back: an error message, a count, or the tool's own message. */
function summarizeOutcome(
	record: ToolCallRecord,
	effect: ToolEffect
): CallOutcome {
	if (record.threw) {
		return {
			status: "error",
			outcome: truncate(record.errorText ?? FAILED_OUTCOME),
		};
	}

	const result = unwrapToolResult(record.output);
	if (!result) return { status: "ok" };

	const data = asRecord(result.data);
	const message = asNonEmptyString(result.message);

	return result.success === false
		? failureOutcome(message, data)
		: successOutcome(effect, message, data);
}

function toReceipt(record: ToolCallRecord): ToolReceipt {
	const effect = classifyToolEffect(record.toolName);
	const { status, outcome, data } = summarizeOutcome(record, effect);
	const entities = extractEntities(record.input, data);

	const receipt: ToolReceipt = {
		toolName: record.toolName,
		label: humanizeToolName(record.toolName),
		effect,
		status,
	};
	const detail = summarizeInput(record.input);
	if (detail) receipt.detail = detail;
	if (outcome) receipt.outcome = outcome;
	if (entities.length > 0) receipt.entities = entities;
	return receipt;
}

/**
 * Collapse repeats of the *same* call with the *same* result into one row.
 *
 * Identity deliberately includes the outcome: a call that failed and then
 * succeeded on retry stays two rows, so the failure is visible rather than
 * averaged away into a tidy "×2".
 */
function collapseRepeats(receipts: ToolReceipt[]): ToolReceipt[] {
	const byKey = new Map<string, ToolReceipt>();
	const ordered: ToolReceipt[] = [];

	for (const receipt of receipts) {
		const key = `${receipt.toolName}|${receipt.detail ?? ""}|${receipt.status}|${receipt.outcome ?? ""}`;
		const existing = byKey.get(key);
		if (existing) {
			existing.attempts = (existing.attempts ?? 1) + 1;
			continue;
		}
		byKey.set(key, receipt);
		ordered.push(receipt);
	}
	return ordered;
}

/** Core builder. Returns null when the turn ran no tools at all. */
export function buildToolReceipts(
	records: ToolCallRecord[]
): ToolReceipts | null {
	const usable = records.filter((r) => !!r.toolName);
	if (usable.length === 0) return null;

	const collapsed = collapseRepeats(usable.map(toReceipt));
	const calls = collapsed.slice(0, MAX_RECEIPT_CALLS);

	const countCalls = (
		rows: ToolReceipt[],
		match: (r: ToolReceipt) => boolean
	) =>
		rows.reduce(
			(total, row) => (match(row) ? total + (row.attempts ?? 1) : total),
			0
		);

	return {
		calls,
		writeCount: countCalls(collapsed, (r) => r.effect === "write"),
		errorCount: countCalls(collapsed, (r) => r.status === "error"),
		totalCallCount: usable.length,
	};
}

/**
 * Pair a call with its result by id. A tool that threw produces no entry in
 * `toolResults`, so positional matching would silently attribute one tool's
 * result to another — the same trap `explainability-builder` documents.
 */
function findResultForCall(
	toolResults: NonNullable<StreamStep["toolResults"]>,
	toolCallId: string | undefined,
	toolName: string,
	index: number
) {
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

/** Server-side entry point: build receipts from `streamText` onFinish steps. */
export function buildToolReceiptsFromSteps(
	steps: StreamStep[] | undefined
): ToolReceipts | null {
	if (!steps || steps.length === 0) return null;

	const records: ToolCallRecord[] = [];
	for (const step of steps) {
		const toolCalls = step.toolCalls ?? [];
		const toolResults = step.toolResults ?? [];
		for (let i = 0; i < toolCalls.length; i++) {
			const call = toolCalls[i];
			if (!call?.toolName) continue;
			const result = findResultForCall(
				toolResults,
				call.toolCallId,
				call.toolName,
				i
			);
			records.push({
				toolName: call.toolName,
				input: call.input,
				output: result?.output,
				// No result for a call that was made means the tool threw. The SDK
				// emits a `tool-error` part instead of a `toolResults` entry.
				threw: result === undefined,
			});
		}
	}
	return buildToolReceipts(records);
}

/**
 * Client-side entry point: build receipts from the streamed message parts, so
 * the receipt is there as soon as the reply is, without waiting for the
 * persisted copy to come back from the history endpoint.
 */
export function buildToolReceiptsFromParts(
	parts: unknown[] | undefined
): ToolReceipts | null {
	if (!parts || parts.length === 0) return null;

	const records: ToolCallRecord[] = [];
	for (const part of parts) {
		if (!isToolPart(part)) continue;
		const info = getToolPartInfo(part);
		if (!info?.toolName) continue;
		// Only terminal states are reported. A call that is still streaming its
		// arguments, or has been sent but not answered, has no outcome yet — and
		// rendering it with a blank outcome would read as a silent success.
		const errored = info.state === "output-error";
		if (!errored && info.state !== "output-available") continue;
		const errorText = asNonEmptyString(
			(part as Record<string, unknown>).errorText
		);
		records.push({
			toolName: info.toolName,
			input: info.input,
			output: info.output,
			...(errored ? { threw: true, errorText } : {}),
		});
	}
	return buildToolReceipts(records);
}
