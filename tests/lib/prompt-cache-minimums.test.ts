import { describe, expect, it, vi } from "vitest";
import {
	getGenerationModelForProvider,
	MODEL_CONFIG,
} from "../../src/app-constants";
import {
	DEFAULT_MIN_CACHEABLE_PREFIX_TOKENS,
	hasKnownCacheablePrefixMinimum,
	minCacheablePrefixTokens,
} from "../../src/lib/anthropic-model-options";
import {
	checkCacheablePrefix,
	warnIfCacheablePrefixTooShort,
} from "../../src/lib/prompt-cache-guard";
import { AGENT_ROUTING_PROMPTS } from "../../src/lib/prompts/agent-routing-prompts";
import { SESSION_SCRIPT_PROMPTS } from "../../src/lib/prompts/session-script-prompts";
import { estimateTokenCount } from "../../src/lib/token-utils";

describe("minCacheablePrefixTokens", () => {
	it("returns the per-model minimum, which is not monotonic across generations", () => {
		// Haiku 4.5 requires 4x what Sonnet 5 does despite being the cheaper tier.
		expect(minCacheablePrefixTokens("claude-haiku-4-5")).toBe(4096);
		expect(minCacheablePrefixTokens("claude-sonnet-5")).toBe(1024);
		expect(minCacheablePrefixTokens("claude-opus-5")).toBe(512);
	});

	it("matches dated model ids", () => {
		expect(minCacheablePrefixTokens("claude-haiku-4-5-20251001")).toBe(4096);
		expect(minCacheablePrefixTokens("claude-sonnet-5-20260101")).toBe(1024);
	});

	it("is case insensitive and tolerates surrounding whitespace", () => {
		expect(minCacheablePrefixTokens("  CLAUDE-HAIKU-4-5  ")).toBe(4096);
	});

	it("does not confuse sonnet 4.x for sonnet 5", () => {
		expect(minCacheablePrefixTokens("claude-sonnet-4-5")).toBe(1024);
		expect(hasKnownCacheablePrefixMinimum("claude-sonnet-4-5")).toBe(true);
	});

	it("falls back to a documented default for unknown ids", () => {
		expect(minCacheablePrefixTokens("some-future-model")).toBe(
			DEFAULT_MIN_CACHEABLE_PREFIX_TOKENS
		);
		expect(hasKnownCacheablePrefixMinimum("some-future-model")).toBe(false);
	});
});

describe("checkCacheablePrefix", () => {
	it("flags a prefix below the model minimum", () => {
		const check = checkCacheablePrefix("claude-haiku-4-5", "x".repeat(4000));
		expect(check.estimatedPrefixTokens).toBe(1000);
		expect(check.minimumPrefixTokens).toBe(4096);
		expect(check.meetsMinimum).toBe(false);
	});

	it("accepts a prefix at or above the minimum", () => {
		const check = checkCacheablePrefix("claude-sonnet-5", "x".repeat(4096));
		expect(check.meetsMinimum).toBe(true);
	});
});

describe("warnIfCacheablePrefixTooShort", () => {
	it("stays silent when verbose LLM usage logging is off", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const check = warnIfCacheablePrefixTooShort(
			{ LORESMITH_VERBOSE_LLM_USAGE: "false" },
			"claude-haiku-4-5",
			"too short"
		);
		expect(check.meetsMinimum).toBe(false);
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("never throws, and reports the check either way", () => {
		const check = warnIfCacheablePrefixTooShort(
			{ LORESMITH_VERBOSE_LLM_USAGE: "true" },
			"claude-sonnet-5",
			"x".repeat(8192)
		);
		expect(check.meetsMinimum).toBe(true);
	});
});

/**
 * Every place the codebase asks for a cache breakpoint, paired with the tier
 * whose model will serve it.
 *
 * This is the guard finding 2 of #761 asks for: below its model's minimum a
 * `cache_control` breakpoint is silently ignored — no error, no charge, no
 * cache — so a tier change that moves a call site onto Haiku would otherwise
 * turn a working breakpoint inert with nothing failing. Add a row here when you
 * add a breakpoint.
 */
const REGISTERED_CACHE_BREAKPOINTS: Array<{
	name: string;
	tier: Parameters<typeof getGenerationModelForProvider>[0];
	prefix: () => string;
}> = [
	{
		name: "session-script (plan-session-tool)",
		tier: "SESSION_PLANNING",
		prefix: () =>
			SESSION_SCRIPT_PROMPTS.formatSessionScriptPromptParts({
				campaignName: "Test campaign",
				sessionTitle: "The drowned keep",
				sessionType: "combat",
				estimatedDuration: 4,
				focusAreas: [],
				recentSessionDigests: [],
				relevantEntities: [],
				characterBackstories: [],
				campaignResources: [],
				isOneOff: false,
			}).cacheablePrefix,
	},
];

describe("registered cache breakpoints clear their model's minimum", () => {
	it.each(REGISTERED_CACHE_BREAKPOINTS)("$name", ({ tier, prefix }) => {
		const modelId = getGenerationModelForProvider(tier);
		const check = checkCacheablePrefix(modelId, prefix());
		expect(
			check.meetsMinimum,
			`${modelId} needs >= ${check.minimumPrefixTokens} prefix tokens to honour a cache breakpoint; this prefix estimates at ${check.estimatedPrefixTokens}. Either lengthen the prefix, move the call to a model with a lower minimum, or drop the breakpoint — as placed it costs full price and caches nothing.`
		).toBe(true);
	});
});

describe("known-inert breakpoints stay documented rather than silently placed", () => {
	it("agent routing's prefix is still below Haiku's minimum (#759, #761 finding 2)", () => {
		const modelId = getGenerationModelForProvider("PIPELINE_LIGHT");
		// Only meaningful while PIPELINE_LIGHT is an Anthropic Haiku tier.
		if (MODEL_CONFIG.PROVIDER.DEFAULT !== "anthropic") return;

		const parts = AGENT_ROUTING_PROMPTS.formatAgentRoutingPromptParts(
			"- campaign: Handles campaign operations",
			"what should I do next?",
			""
		);
		const prefixText = Object.values(parts)
			.filter((v): v is string => typeof v === "string")
			.join("\n");
		const estimated = estimateTokenCount(prefixText);

		// Documents the measured state rather than asserting a target: if a
		// future prompt change pushes this over 4,096, a breakpoint becomes worth
		// placing and this test should be updated to say so.
		expect(estimated).toBeLessThan(minCacheablePrefixTokens(modelId));
	});
});
