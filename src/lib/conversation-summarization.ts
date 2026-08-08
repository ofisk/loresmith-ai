/**
 * Rolling summarization of older chat turns so long conversations stay cheap.
 *
 * Without this, {@link BaseAgent} sends the last N user/assistant messages verbatim
 * on every turn. That has two costs: the token bill grows with N, and because the
 * window slides by one turn each time, the prompt prefix changes constantly and
 * provider prompt caching never gets a hit.
 *
 * Strategy — "batched rolling summary":
 *  - The most recent {@link RECENT_MESSAGE_WINDOW} messages are always verbatim.
 *  - Older messages are condensed into a single summary block injected as system context.
 *  - We only pay for a summarization LLM call once {@link RESUMMARIZE_BATCH_SIZE}
 *    messages have aged past the verbatim window since the last summary. Until then
 *    the stragglers ride along verbatim, so the typical turn adds zero latency.
 *  - Each summarization folds the previous summary in, so the summary is cumulative
 *    and the input to each call stays small.
 *
 * All selection logic here is pure and synchronous so it can be unit tested without
 * a model; the single LLM call lives in {@link summarizeConversation}.
 *
 * Note on state: the summary is keyed by position in the history the Chat DO holds,
 * which is supplied by the client each turn. If that list is ever left-truncated the
 * positions shift; {@link isSummaryStateValid} detects this via a boundary fingerprint
 * and we rebuild the summary from scratch rather than mis-attribute it. Correct, and
 * at worst one extra call.
 */

import { generateText } from "ai";
import { getGenerationModelForProvider, MODEL_CONFIG } from "@/app-constants";
import { anthropicSamplingParams } from "./anthropic-model-options";
import type { EnvWithSecrets } from "./env-utils";
import { createModel } from "./model-config";

/** Messages we can summarize. Structurally compatible with `ChatMessage`. */
export interface SummarizableMessage {
	role: string;
	content: unknown;
	[key: string]: unknown;
}

/** Number of most-recent user/assistant messages always sent verbatim. */
export const RECENT_MESSAGE_WINDOW = 10;

/**
 * How many messages must age past the verbatim window before we spend another
 * summarization call. Higher = cheaper and lower latency, but a larger verbatim tail.
 */
export const RESUMMARIZE_BATCH_SIZE = 8;

/**
 * Conversations shorter than this are never summarized — the whole thing fits in
 * the verbatim window plus one un-summarized batch.
 */
export const SUMMARIZATION_TRIGGER_COUNT =
	RECENT_MESSAGE_WINDOW + RESUMMARIZE_BATCH_SIZE;

/** Hard cap on messages fed into a single summarization call (cold-start guard). */
export const MAX_MESSAGES_PER_SUMMARY_CALL = 40;

/** Per-message truncation for summarization input. ~500 tokens at 4 chars/token. */
export const MAX_CHARS_PER_SUMMARIZED_MESSAGE = 2000;

/** Output cap for the summary itself. Keeps the injected block bounded. */
export const SUMMARY_MAX_OUTPUT_TOKENS = 900;

/** Characters of message text used to fingerprint a cache boundary. */
const FINGERPRINT_SAMPLE_CHARS = 120;

/** Durable Object storage key for the persisted rolling summary. */
export const CONVERSATION_SUMMARY_STORAGE_KEY =
	"loresmith-conversation-summary";

/** Env var gate. Unset defaults to enabled; set to a falsy value to turn off. */
export const CONVERSATION_SUMMARY_ENV = "LORESMITH_CONVERSATION_SUMMARY";

const FALSY_FLAG_VALUES = new Set(["0", "false", "no", "off"]);
const TRUTHY_FLAG_VALUES = new Set(["1", "true", "yes", "on"]);

/**
 * Whether rolling summarization is enabled. Defaults to on; an explicit falsy
 * value for {@link CONVERSATION_SUMMARY_ENV} disables it (kill switch for prod).
 */
export function isConversationSummarizationEnabled(
	env?: EnvWithSecrets | Record<string, unknown>
): boolean {
	const fromEnv = (env as Record<string, unknown> | undefined)?.[
		CONVERSATION_SUMMARY_ENV
	];
	const fromProcess =
		typeof process !== "undefined"
			? process.env[CONVERSATION_SUMMARY_ENV]
			: undefined;

	if (typeof fromEnv === "boolean") return fromEnv;

	const raw =
		(typeof fromEnv === "string" ? fromEnv : undefined) ??
		(typeof fromProcess === "string" ? fromProcess : undefined);

	if (raw === undefined || raw.trim() === "") return true;

	const normalized = raw.trim().toLowerCase();
	if (FALSY_FLAG_VALUES.has(normalized)) return false;
	if (TRUTHY_FLAG_VALUES.has(normalized)) return true;
	return true;
}

/** Persisted rolling summary state, stored per conversation in DO storage. */
export interface ConversationSummaryState {
	/** The cumulative condensed summary of everything before {@link coveredCount}. */
	summary: string;
	/**
	 * How many user/assistant messages (from the start of the filtered history)
	 * the summary accounts for.
	 */
	coveredCount: number;
	/**
	 * Fingerprint of the last covered message, so a truncated or replaced history
	 * invalidates the cache instead of silently mis-attributing the summary.
	 */
	fingerprint: string;
	/** Epoch ms of the last successful summarization. Diagnostics only. */
	updatedAt: number;
}

/** What the agent should actually send this turn. */
export interface ConversationContextPlan {
	/** Messages to include verbatim, in order. */
	verbatimMessages: SummarizableMessage[];
	/** Messages that must be folded into the summary before this turn is sent. */
	messagesToSummarize: SummarizableMessage[];
	/** Existing summary to carry forward (and fold new messages into), if any. */
	priorSummary: string | null;
	/** Index (into the filtered history) the summary will cover through, exclusive. */
	nextCoveredCount: number;
	/** True when {@link messagesToSummarize} is non-empty and an LLM call is needed. */
	needsSummarization: boolean;
}

function messageText(message: SummarizableMessage): string {
	const { content } = message;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === "string") return part;
				const text = (part as { text?: unknown } | null)?.text;
				return typeof text === "string" ? text : "";
			})
			.filter(Boolean)
			.join("\n");
	}
	return "";
}

/**
 * Cheap, stable fingerprint of a message. Not cryptographic — it only has to
 * detect "this is a different conversation / the history was rewritten".
 */
export function fingerprintMessage(message: SummarizableMessage): string {
	const text = messageText(message).slice(0, FINGERPRINT_SAMPLE_CHARS);
	let hash = 0;
	const seed = `${message.role}:${text}`;
	for (let i = 0; i < seed.length; i++) {
		hash = (hash << 5) - hash + seed.charCodeAt(i);
		hash |= 0; // force int32
	}
	return `${seed.length}:${(hash >>> 0).toString(36)}`;
}

/**
 * Whether a persisted summary still lines up with the current history.
 * Guards against DO reuse, history truncation, and off-by-one drift.
 */
export function isSummaryStateValid(
	state: ConversationSummaryState | null | undefined,
	messages: SummarizableMessage[]
): state is ConversationSummaryState {
	if (!state || typeof state.summary !== "string" || !state.summary.trim()) {
		return false;
	}
	if (
		!Number.isInteger(state.coveredCount) ||
		state.coveredCount <= 0 ||
		state.coveredCount > messages.length
	) {
		return false;
	}
	const boundaryMessage = messages[state.coveredCount - 1];
	if (!boundaryMessage) return false;
	return fingerprintMessage(boundaryMessage) === state.fingerprint;
}

/**
 * Decide what to send this turn: which messages stay verbatim, which get folded
 * into the summary, and whether an LLM call is needed at all.
 *
 * Pure — no I/O, no model. `messages` must already be filtered to user/assistant
 * roles and ordered oldest → newest.
 */
export function planConversationContext(
	messages: SummarizableMessage[],
	state: ConversationSummaryState | null | undefined,
	options: {
		recentWindow?: number;
		resummarizeBatchSize?: number;
		maxMessagesPerCall?: number;
	} = {}
): ConversationContextPlan {
	const recentWindow = options.recentWindow ?? RECENT_MESSAGE_WINDOW;
	const batchSize = options.resummarizeBatchSize ?? RESUMMARIZE_BATCH_SIZE;
	const maxPerCall =
		options.maxMessagesPerCall ?? MAX_MESSAGES_PER_SUMMARY_CALL;

	const validState = isSummaryStateValid(state, messages) ? state : null;
	const priorSummary = validState?.summary ?? null;
	const coveredCount = validState?.coveredCount ?? 0;

	// Everything from coveredCount up to the verbatim window is "aged out" but not
	// yet summarized. We only pay for a call once that backlog reaches batchSize.
	const windowStart = Math.max(0, messages.length - recentWindow);
	const backlog = Math.max(0, windowStart - coveredCount);

	if (backlog < batchSize) {
		// Carry the existing summary; keep the un-summarized stragglers verbatim.
		return {
			verbatimMessages: messages.slice(coveredCount),
			messagesToSummarize: [],
			priorSummary,
			nextCoveredCount: coveredCount,
			needsSummarization: false,
		};
	}

	// Fold the whole backlog in. Cap the per-call input on a cold start (no prior
	// summary and a very long history) so one call can't blow up in size.
	const backlogMessages = messages.slice(coveredCount, windowStart);
	const messagesToSummarize =
		backlogMessages.length > maxPerCall
			? backlogMessages.slice(-maxPerCall)
			: backlogMessages;

	return {
		verbatimMessages: messages.slice(windowStart),
		messagesToSummarize,
		priorSummary,
		nextCoveredCount: windowStart,
		needsSummarization: messagesToSummarize.length > 0,
	};
}

const SUMMARY_SYSTEM_PROMPT = `You compress earlier turns of a tabletop RPG assistant conversation into durable notes.

The notes replace those turns in the model's context, so anything you omit is forgotten. Preserve:
- Concrete decisions, preferences, and constraints the user stated (campaign tone, rules system, house rules, names, pronouns).
- Named entities: campaigns, characters, NPCs, locations, factions, sessions, files, and how they relate.
- Open threads: what the user asked for that is not finished, and anything they said they would come back to.
- Outcomes of prior actions (what was created, uploaded, renamed, deleted) so the assistant does not redo them.

Drop pleasantries, restatements, tool mechanics, and anything superseded by a later turn.

Write terse factual notes grouped under short "## " headings. No preamble, no closing summary, no advice. Under 400 words.`;

/**
 * Render the summarization request. Exported for tests and prompt review.
 */
export function buildSummaryPrompt(
	messagesToSummarize: SummarizableMessage[],
	priorSummary: string | null,
	maxCharsPerMessage: number = MAX_CHARS_PER_SUMMARIZED_MESSAGE
): string {
	const transcript = messagesToSummarize
		.map((message) => {
			const text = messageText(message).trim();
			const truncated =
				text.length > maxCharsPerMessage
					? `${text.slice(0, maxCharsPerMessage)}… [truncated]`
					: text;
			return `${message.role.toUpperCase()}: ${truncated || "(no text content)"}`;
		})
		.join("\n\n");

	if (priorSummary) {
		return [
			"Existing notes covering the conversation so far:",
			"<existing_notes>",
			priorSummary.trim(),
			"</existing_notes>",
			"",
			"Newer turns that are now aging out of the verbatim window:",
			"<new_turns>",
			transcript,
			"</new_turns>",
			"",
			"Return a single merged set of notes covering both. Keep still-relevant facts from the existing notes, integrate the new turns, and drop anything the new turns superseded.",
		].join("\n");
	}

	return [
		"Earlier turns aging out of the verbatim window:",
		"<turns>",
		transcript,
		"</turns>",
		"",
		"Return notes covering these turns.",
	].join("\n");
}

/** Wrap a summary for injection as supplemental system context. */
export function formatSummaryBlock(summary: string): string {
	return `## Earlier conversation summary\nCondensed notes from earlier turns of this conversation that are no longer shown verbatim below. Treat them as established context, not as something the user just said.\n\n${summary.trim()}`;
}

export interface SummarizeResult {
	summary: string;
	usage?: {
		promptTokens?: number;
		completionTokens?: number;
		totalTokens?: number;
	};
	modelId: string;
}

/**
 * Run the summarization call on the light/cheap model tier.
 *
 * Throws on provider failure — callers should treat summarization as best-effort
 * and fall back to plain truncation.
 */
export async function summarizeConversation(params: {
	messagesToSummarize: SummarizableMessage[];
	priorSummary: string | null;
	apiKey: string;
	model?: unknown;
}): Promise<SummarizeResult> {
	const { messagesToSummarize, priorSummary, apiKey } = params;

	const modelId = getGenerationModelForProvider("PIPELINE_LIGHT");
	const model = params.model ?? createModel(modelId, apiKey);
	const resolvedModelId = (model as { modelId?: string })?.modelId ?? modelId;

	const sampling = anthropicSamplingParams(
		resolvedModelId,
		MODEL_CONFIG.PARAMETERS.METADATA_ANALYSIS_TEMPERATURE
	);

	const result = await generateText({
		model: model as Parameters<typeof generateText>[0]["model"],
		system: SUMMARY_SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: buildSummaryPrompt(messagesToSummarize, priorSummary),
			},
		],
		maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
		...sampling,
	});

	const usage = result.usage as SummarizeResult["usage"];
	return {
		summary: (result.text ?? "").trim(),
		usage,
		modelId: resolvedModelId,
	};
}

/** Build the state object to persist after a successful summarization. */
export function buildSummaryState(
	summary: string,
	messages: SummarizableMessage[],
	coveredCount: number,
	now: number
): ConversationSummaryState {
	const boundaryMessage = messages[coveredCount - 1];
	return {
		summary,
		coveredCount,
		fingerprint: boundaryMessage ? fingerprintMessage(boundaryMessage) : "",
		updatedAt: now,
	};
}
