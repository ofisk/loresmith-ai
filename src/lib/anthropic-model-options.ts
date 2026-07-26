/**
 * Claude Sonnet 5 (and later) compatibility helpers.
 *
 * Sonnet 5: adaptive thinking on by default at effort "high"; non-default
 * temperature / top_p / top_k return 400. We default effort to "medium" for cost.
 */

export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

/** Default effort for Sonnet 5+ generation (cost step-down from API default "high"). */
export const DEFAULT_SONNET5_EFFORT: AnthropicEffort = "medium";

/**
 * True for Claude Sonnet 5 and newer Sonnet IDs that reject non-default sampling
 * and use adaptive thinking + effort (e.g. claude-sonnet-5, claude-sonnet-5-...).
 */
export function isSonnet5OrNewer(modelId: string): boolean {
	const id = modelId.toLowerCase();
	// Match claude-sonnet-5 but not claude-sonnet-4-5 / claude-sonnet-4-6
	return /^claude-sonnet-5($|-)/.test(id);
}

/**
 * Minimum cacheable prefix length, in tokens, per Anthropic model family.
 *
 * A `cache_control` breakpoint on a prefix shorter than this is **silently
 * ignored** by the API — no error, no charge, no cache. The minimum is
 * per-model and is NOT monotonic across generations: Haiku 4.5 requires 4x
 * what Sonnet 5 does, so it cannot be derived from a "newer is smaller" rule
 * the way `isSonnet5OrNewer` derives sampling behaviour.
 *
 * Ordered most-specific-first; the first matching pattern wins.
 */
const MIN_CACHEABLE_PREFIX_TOKENS: ReadonlyArray<readonly [RegExp, number]> = [
	[/^claude-haiku-4-5($|-)/, 4096],
	[/^claude-3-5-haiku($|-)/, 2048],
	[/^claude-3-haiku($|-)/, 2048],
	[/^claude-opus-5($|-)/, 512],
	[/^claude-opus-4($|-)/, 1024],
	[/^claude-sonnet-5($|-)/, 1024],
	[/^claude-sonnet-4($|-)/, 1024],
	[/^claude-3-7-sonnet($|-)/, 1024],
	[/^claude-3-5-sonnet($|-)/, 1024],
];

/** Assumed minimum for model ids not in the table above. */
export const DEFAULT_MIN_CACHEABLE_PREFIX_TOKENS = 1024;

/**
 * Minimum prefix length (tokens) a `cache_control` breakpoint must reach on
 * this model before the API will honour it. Unknown ids fall back to
 * {@link DEFAULT_MIN_CACHEABLE_PREFIX_TOKENS}.
 */
export function minCacheablePrefixTokens(modelId: string): number {
	const id = modelId.trim().toLowerCase();
	for (const [pattern, minimum] of MIN_CACHEABLE_PREFIX_TOKENS) {
		if (pattern.test(id)) {
			return minimum;
		}
	}
	return DEFAULT_MIN_CACHEABLE_PREFIX_TOKENS;
}

/** Whether {@link minCacheablePrefixTokens} matched a known model family. */
export function hasKnownCacheablePrefixMinimum(modelId: string): boolean {
	const id = modelId.trim().toLowerCase();
	return MIN_CACHEABLE_PREFIX_TOKENS.some(([pattern]) => pattern.test(id));
}

/**
 * Provider options for AI SDK Anthropic calls on Sonnet 5+.
 */
export function getAnthropicSonnet5ProviderOptions(
	effort: AnthropicEffort = DEFAULT_SONNET5_EFFORT
): { anthropic: { effort: AnthropicEffort } } {
	return {
		anthropic: {
			effort,
		},
	};
}

/**
 * Same policy as {@link anthropicSamplingParams}, expressed in raw Messages API
 * fields rather than AI SDK fields — for the Message Batches path, which builds
 * request params directly instead of going through the AI SDK.
 *
 * On Sonnet 5+ `effort` lives inside `output_config`, and temperature is
 * omitted because a non-default value is rejected with a 400.
 */
export function anthropicBatchModelParams(
	modelId: string,
	temperature?: number
): {
	temperature?: number;
	output_config?: { effort: AnthropicEffort };
} {
	if (isSonnet5OrNewer(modelId)) {
		return { output_config: { effort: DEFAULT_SONNET5_EFFORT } };
	}
	if (temperature === undefined) {
		return {};
	}
	return { temperature };
}

/**
 * Build generateText / streamText sampling fields.
 * Omits temperature (and related) for Sonnet 5+; includes temperature otherwise.
 */
export function anthropicSamplingParams(
	modelId: string,
	temperature: number | undefined
): {
	temperature?: number;
	providerOptions?: ReturnType<typeof getAnthropicSonnet5ProviderOptions>;
} {
	if (isSonnet5OrNewer(modelId)) {
		return {
			providerOptions: getAnthropicSonnet5ProviderOptions(),
		};
	}
	if (temperature === undefined) {
		return {};
	}
	return { temperature };
}
