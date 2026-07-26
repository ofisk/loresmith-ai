/**
 * Model rate card → USD, for the admin cost-attribution dashboard (issue #738).
 *
 * Rates are USD per **million** tokens. Update `MODEL_RATES` when a provider
 * changes pricing; nothing else in the app reads these numbers, so a wrong rate
 * skews dashboards but cannot affect user-facing behaviour.
 *
 * Anthropic rates are the published list prices as of 2026-06-24. Note Claude
 * Sonnet 5 carries an introductory $2/$10 rate through 2026-08-31; we bill the
 * dashboard at list ($3/$15) so tier-solvency decisions are made against the
 * price we will actually pay once the intro period ends.
 *
 * OpenAI rates are marked `unverified` — the app defaults to Anthropic
 * (`MODEL_CONFIG.PROVIDER.DEFAULT`), so these paths are secondary. Spend priced
 * from an unverified rate is reported separately in the dashboard rather than
 * silently folded into the headline number.
 */

/** Cache-read tokens bill at ~0.1x the base input rate. */
const CACHE_READ_MULTIPLIER = 0.1;
/**
 * Cache-*write* tokens bill at 1.25x base input for the 5-minute ephemeral TTL,
 * which is what `anthropic-provider.ts` requests (`cacheControl: ephemeral`).
 */
const CACHE_WRITE_MULTIPLIER = 1.25;

export interface ModelRate {
	/** USD per million uncached input tokens. */
	inputPerMTok: number;
	/** USD per million output tokens. */
	outputPerMTok: number;
	/** USD per million cache-read tokens; derived from input when omitted. */
	cachedInputPerMTok?: number;
	/** USD per million cache-write tokens; derived from input when omitted. */
	cacheWritePerMTok?: number;
	/** Rate has not been checked against the provider's published pricing. */
	unverified?: boolean;
}

export const MODEL_RATES: Record<string, ModelRate> = {
	// --- Anthropic (verified 2026-06-24) ---
	"claude-fable-5": { inputPerMTok: 10, outputPerMTok: 50 },
	"claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
	"claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25 },
	"claude-opus-4-7": { inputPerMTok: 5, outputPerMTok: 25 },
	"claude-opus-4-6": { inputPerMTok: 5, outputPerMTok: 25 },
	"claude-sonnet-5": { inputPerMTok: 3, outputPerMTok: 15 },
	"claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
	"claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },

	// --- OpenAI (unverified; secondary provider) ---
	"gpt-5.2": { inputPerMTok: 1.25, outputPerMTok: 10, unverified: true },
	"gpt-5-mini": { inputPerMTok: 0.25, outputPerMTok: 2, unverified: true },
	"gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6, unverified: true },
	"text-embedding-3-small": {
		inputPerMTok: 0.02,
		outputPerMTok: 0,
		unverified: true,
	},
};

/**
 * Normalise a model id to a rate-card key.
 *
 * Providers accept both bare aliases (`claude-sonnet-5`) and dated snapshots
 * (`claude-haiku-4-5-20251001`); both must price the same. Longest-prefix match
 * avoids `claude-opus-4-6` accidentally matching a `claude-opus-4` key.
 */
export function resolveModelRate(model: string | null | undefined): {
	key: string;
	rate: ModelRate;
} | null {
	if (!model) return null;
	const normalized = model.trim().toLowerCase();
	if (MODEL_RATES[normalized]) {
		return { key: normalized, rate: MODEL_RATES[normalized] };
	}

	let bestKey: string | null = null;
	for (const key of Object.keys(MODEL_RATES)) {
		if (!normalized.startsWith(key)) continue;
		if (bestKey === null || key.length > bestKey.length) {
			bestKey = key;
		}
	}
	return bestKey ? { key: bestKey, rate: MODEL_RATES[bestKey] } : null;
}

export interface TokenBreakdown {
	/** Uncached input tokens. Cache reads/writes are counted separately. */
	promptTokens?: number;
	completionTokens?: number;
	cachedInputTokens?: number;
	cacheWriteTokens?: number;
}

export interface CostEstimate {
	costUsd: number;
	/** False when the model has no rate-card entry; costUsd is then 0. */
	priced: boolean;
	/** True when priced from a rate flagged `unverified`. */
	unverified: boolean;
}

const PER_TOKEN = 1_000_000;

/** Price a single LLM call. Never throws — unknown models return unpriced. */
export function estimateCostUsd(
	model: string | null | undefined,
	tokens: TokenBreakdown
): CostEstimate {
	const resolved = resolveModelRate(model);
	if (!resolved) {
		return { costUsd: 0, priced: false, unverified: false };
	}
	const { rate } = resolved;
	const cachedRate =
		rate.cachedInputPerMTok ?? rate.inputPerMTok * CACHE_READ_MULTIPLIER;
	const cacheWriteRate =
		rate.cacheWritePerMTok ?? rate.inputPerMTok * CACHE_WRITE_MULTIPLIER;

	const costUsd =
		((tokens.promptTokens ?? 0) * rate.inputPerMTok +
			(tokens.completionTokens ?? 0) * rate.outputPerMTok +
			(tokens.cachedInputTokens ?? 0) * cachedRate +
			(tokens.cacheWriteTokens ?? 0) * cacheWriteRate) /
		PER_TOKEN;

	return {
		costUsd,
		priced: true,
		unverified: rate.unverified === true,
	};
}
