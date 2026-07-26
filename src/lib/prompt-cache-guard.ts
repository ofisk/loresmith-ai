import {
	hasKnownCacheablePrefixMinimum,
	minCacheablePrefixTokens,
} from "@/lib/anthropic-model-options";
import type { EnvWithSecrets } from "@/lib/env-utils";
import { isVerboseLlmSpendEnabled } from "@/lib/llm-usage-verbose-log";
import { createLogger } from "@/lib/logger";
import { estimateTokenCount } from "@/lib/token-utils";

/**
 * Result of checking a cache breakpoint against its model's minimum prefix.
 *
 * `meetsMinimum: false` means the API will silently drop the breakpoint: the
 * request succeeds, costs the same as an uncached one, and writes nothing to
 * the cache. There is no signal from the API that this happened, which is why
 * we estimate locally.
 */
export interface CacheablePrefixCheck {
	modelId: string;
	/** Locally estimated prefix length (~4 chars/token, see token-utils). */
	estimatedPrefixTokens: number;
	/** Minimum this model requires before honouring a breakpoint. */
	minimumPrefixTokens: number;
	meetsMinimum: boolean;
	/** False when the model id had no table entry and a default was assumed. */
	minimumIsKnown: boolean;
}

/**
 * Estimate whether a cacheable prefix is long enough for this model to honour
 * the breakpoint. Pure — callers decide whether to log or act.
 */
export function checkCacheablePrefix(
	modelId: string,
	cacheablePrefix: string
): CacheablePrefixCheck {
	const estimatedPrefixTokens = estimateTokenCount(cacheablePrefix);
	const minimumPrefixTokens = minCacheablePrefixTokens(modelId);
	return {
		modelId,
		estimatedPrefixTokens,
		minimumPrefixTokens,
		meetsMinimum: estimatedPrefixTokens >= minimumPrefixTokens,
		minimumIsKnown: hasKnownCacheablePrefixMinimum(modelId),
	};
}

/**
 * Warn — only under LORESMITH_VERBOSE_LLM_USAGE — when a breakpoint is about to
 * be placed on a prefix too short for the model to cache.
 *
 * Deliberately advisory: we still send the breakpoint. It costs nothing to send
 * and a local 4-chars-per-token estimate is not accurate enough to justify
 * suppressing a breakpoint that might actually clear the bar.
 */
export function warnIfCacheablePrefixTooShort(
	env: EnvWithSecrets | Record<string, unknown> | undefined,
	modelId: string,
	cacheablePrefix: string,
	context?: Record<string, unknown>
): CacheablePrefixCheck {
	const check = checkCacheablePrefix(modelId, cacheablePrefix);
	if (check.meetsMinimum || !isVerboseLlmSpendEnabled(env)) {
		return check;
	}
	const log = createLogger(
		env as Record<string, unknown> | undefined,
		"[LLM_USAGE]"
	);
	log.warn("prompt_cache_prefix_below_minimum", {
		event: "prompt_cache_prefix_below_minimum",
		...check,
		...(context ?? {}),
		note: "cache_control breakpoint will be silently ignored by the API",
	});
	return check;
}
