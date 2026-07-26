/**
 * Normalises AI SDK usage objects into the token breakdown the cost-attribution
 * dashboard prices against (issue #738).
 *
 * The aggregate token count alone cannot be priced: output tokens cost ~5x input
 * on every current model, so a 90/10 input/output call and a 10/90 one with the
 * same total differ by ~4x in dollars. These helpers keep the split intact from
 * the provider call all the way to `llm_cost_events`.
 */

/** Token split for one provider call. Cache reads/writes are *not* in `promptTokens`. */
export interface LlmTokenBreakdown {
	/** Uncached input tokens. */
	promptTokens?: number;
	completionTokens?: number;
	/** Cache-read tokens (~0.1x input rate). */
	cachedInputTokens?: number;
	/** Cache-write tokens (~1.25x input rate for the 5-minute ephemeral TTL). */
	cacheWriteTokens?: number;
}

/** What providers hand to `LLMOptions.onUsage`. */
export interface LlmUsageReport extends LlmTokenBreakdown {
	tokens: number;
	queryCount: number;
}

/**
 * AI SDK v7 reports `inputTokens`/`outputTokens`; older v4-shaped results (still
 * read on some OpenAI paths) use `promptTokens`/`completionTokens`. Accept both
 * so a naming change upstream degrades to zeros rather than mispriced spend.
 */
type AiSdkUsage = {
	totalTokens?: number;
	inputTokens?: number;
	outputTokens?: number;
	promptTokens?: number;
	completionTokens?: number;
	cachedInputTokens?: number;
};

/**
 * Anthropic reports cache *writes* in provider metadata rather than in `usage`
 * (cache reads land on `usage.cachedInputTokens`).
 *
 * On `@ai-sdk/anthropic` v4 the number lives inside the raw usage blob the SDK
 * forwards verbatim at `providerMetadata.anthropic.usage`, so it arrives in the
 * API's snake_case — `AnthropicMessageMetadata` has no top-level
 * `cacheCreationInputTokens`. Reading only the top-level camelCase field would
 * report 0 cache writes on every call, which is indistinguishable from a
 * breakpoint that is never being honoured. Check every shape so a naming change
 * upstream degrades to zero rather than silently hiding cache activity.
 */
function readCacheWriteTokens(providerMetadata: unknown): number {
	const anthropic = (
		providerMetadata as
			| {
					anthropic?: {
						cacheCreationInputTokens?: unknown;
						usage?: unknown;
					};
			  }
			| undefined
	)?.anthropic;
	if (!anthropic) return 0;

	const candidates: unknown[] = [anthropic.cacheCreationInputTokens];
	const rawUsage = anthropic.usage;
	if (rawUsage && typeof rawUsage === "object") {
		const usage = rawUsage as Record<string, unknown>;
		candidates.push(
			usage.cache_creation_input_tokens,
			usage.cacheCreationInputTokens
		);
	}

	for (const raw of candidates) {
		if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
			return raw;
		}
	}
	return 0;
}

function num(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: 0;
}

function inputTokensOf(usage: AiSdkUsage | undefined): number {
	return num(usage?.inputTokens) || num(usage?.promptTokens);
}

function outputTokensOf(usage: AiSdkUsage | undefined): number {
	return num(usage?.outputTokens) || num(usage?.completionTokens);
}

/** Total billable tokens for rate limiting (all token classes count against quota). */
export function totalUsageTokens(usage: unknown): number {
	const typed = usage as AiSdkUsage | undefined;
	return typed?.totalTokens ?? inputTokensOf(typed) + outputTokensOf(typed);
}

/** Extract the priced token split from one AI SDK result. */
export function toTokenBreakdown(
	usage: unknown,
	providerMetadata?: unknown
): LlmTokenBreakdown {
	const typed = usage as AiSdkUsage | undefined;
	return {
		promptTokens: inputTokensOf(typed),
		completionTokens: outputTokensOf(typed),
		cachedInputTokens: num(typed?.cachedInputTokens),
		cacheWriteTokens: readCacheWriteTokens(providerMetadata),
	};
}

/** Sum breakdowns across calls (e.g. a generation plus its JSON-repair retry). */
export function addTokenBreakdowns(
	...parts: (LlmTokenBreakdown | undefined)[]
): LlmTokenBreakdown {
	const total: Required<LlmTokenBreakdown> = {
		promptTokens: 0,
		completionTokens: 0,
		cachedInputTokens: 0,
		cacheWriteTokens: 0,
	};
	for (const part of parts) {
		if (!part) continue;
		total.promptTokens += part.promptTokens ?? 0;
		total.completionTokens += part.completionTokens ?? 0;
		total.cachedInputTokens += part.cachedInputTokens ?? 0;
		total.cacheWriteTokens += part.cacheWriteTokens ?? 0;
	}
	return total;
}

/**
 * Narrow a provider's usage report to just the priced fields, for spreading into
 * `recordUsage` metadata without dragging `tokens`/`queryCount` along.
 */
export function pickTokenBreakdown(
	usage: LlmTokenBreakdown | undefined
): LlmTokenBreakdown {
	return {
		promptTokens: usage?.promptTokens,
		completionTokens: usage?.completionTokens,
		cachedInputTokens: usage?.cachedInputTokens,
		cacheWriteTokens: usage?.cacheWriteTokens,
	};
}

/** True when the split is known well enough to price the call. */
export function hasPriceableSplit(breakdown: LlmTokenBreakdown): boolean {
	return (
		(breakdown.promptTokens ?? 0) > 0 ||
		(breakdown.completionTokens ?? 0) > 0 ||
		(breakdown.cachedInputTokens ?? 0) > 0 ||
		(breakdown.cacheWriteTokens ?? 0) > 0
	);
}
