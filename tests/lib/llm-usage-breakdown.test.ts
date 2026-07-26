import { describe, expect, it } from "vitest";
import {
	addTokenBreakdowns,
	hasPriceableSplit,
	pickTokenBreakdown,
	toTokenBreakdown,
	totalUsageTokens,
} from "@/lib/llm-usage-breakdown";
import {
	LLM_SPEND_INTENT,
	LLM_SPEND_SURFACE,
	surfaceForIntent,
} from "@/lib/llm-usage-intents";

describe("toTokenBreakdown", () => {
	it("reads the AI SDK v7 input/output field names", () => {
		expect(
			toTokenBreakdown({ inputTokens: 100, outputTokens: 20, totalTokens: 120 })
		).toEqual({
			promptTokens: 100,
			completionTokens: 20,
			cachedInputTokens: 0,
			cacheWriteTokens: 0,
		});
	});

	it("falls back to the older prompt/completion field names", () => {
		expect(
			toTokenBreakdown({ promptTokens: 40, completionTokens: 5 })
		).toMatchObject({ promptTokens: 40, completionTokens: 5 });
	});

	it("reads Anthropic cache-write tokens from provider metadata", () => {
		const result = toTokenBreakdown(
			{ inputTokens: 10, outputTokens: 2, cachedInputTokens: 900 },
			{ anthropic: { cacheCreationInputTokens: 500 } }
		);
		expect(result.cachedInputTokens).toBe(900);
		expect(result.cacheWriteTokens).toBe(500);
	});

	it("reads cache-write tokens from the raw usage blob the SDK actually forwards", () => {
		// @ai-sdk/anthropic v4 puts the API's snake_case usage object at
		// providerMetadata.anthropic.usage; there is no top-level camelCase
		// mirror, so reading only that would report 0 writes on every call.
		const result = toTokenBreakdown(
			{ inputTokens: 10, outputTokens: 2 },
			{ anthropic: { usage: { cache_creation_input_tokens: 4200 } } }
		);
		expect(result.cacheWriteTokens).toBe(4200);
	});

	it("accepts a camelCase mirror inside the raw usage blob", () => {
		const result = toTokenBreakdown(
			{ inputTokens: 10, outputTokens: 2 },
			{ anthropic: { usage: { cacheCreationInputTokens: 7 } } }
		);
		expect(result.cacheWriteTokens).toBe(7);
	});

	it("ignores a malformed usage blob rather than throwing", () => {
		expect(
			toTokenBreakdown(
				{ inputTokens: 1, outputTokens: 1 },
				{ anthropic: { usage: "not-an-object" } }
			).cacheWriteTokens
		).toBe(0);
	});

	it("degrades to zeros on an unrecognised usage shape", () => {
		expect(toTokenBreakdown(undefined)).toEqual({
			promptTokens: 0,
			completionTokens: 0,
			cachedInputTokens: 0,
			cacheWriteTokens: 0,
		});
	});
});

describe("totalUsageTokens", () => {
	it("prefers the reported total", () => {
		expect(
			totalUsageTokens({ totalTokens: 999, inputTokens: 1, outputTokens: 1 })
		).toBe(999);
	});

	it("sums input and output when no total is reported", () => {
		expect(totalUsageTokens({ inputTokens: 10, outputTokens: 3 })).toBe(13);
	});

	it("returns 0 for missing usage", () => {
		expect(totalUsageTokens(undefined)).toBe(0);
	});
});

describe("addTokenBreakdowns", () => {
	it("folds a JSON-repair retry into the original call", () => {
		expect(
			addTokenBreakdowns(
				{ promptTokens: 100, completionTokens: 10 },
				{ promptTokens: 50, completionTokens: 5 }
			)
		).toEqual({
			promptTokens: 150,
			completionTokens: 15,
			cachedInputTokens: 0,
			cacheWriteTokens: 0,
		});
	});

	it("ignores undefined parts", () => {
		expect(addTokenBreakdowns(undefined, { promptTokens: 7 })).toMatchObject({
			promptTokens: 7,
		});
	});
});

describe("pickTokenBreakdown", () => {
	it("drops tokens/queryCount so they do not leak into metadata", () => {
		const picked = pickTokenBreakdown({
			promptTokens: 5,
			completionTokens: 1,
		} as never);
		expect(Object.keys(picked).sort()).toEqual([
			"cacheWriteTokens",
			"cachedInputTokens",
			"completionTokens",
			"promptTokens",
		]);
	});
});

describe("hasPriceableSplit", () => {
	it("is false when nothing is known", () => {
		expect(hasPriceableSplit({})).toBe(false);
		expect(hasPriceableSplit({ promptTokens: 0, completionTokens: 0 })).toBe(
			false
		);
	});

	it("is true when any token class is populated", () => {
		expect(hasPriceableSplit({ completionTokens: 1 })).toBe(true);
		expect(hasPriceableSplit({ cachedInputTokens: 1 })).toBe(true);
	});
});

describe("surfaceForIntent", () => {
	it("treats chat and its inline summarisation as interactive", () => {
		expect(surfaceForIntent(LLM_SPEND_INTENT.user_prompt)).toBe(
			LLM_SPEND_SURFACE.interactive
		);
		expect(surfaceForIntent(LLM_SPEND_INTENT.conversation_summary)).toBe(
			LLM_SPEND_SURFACE.interactive
		);
	});

	it("treats the per-message routing classifier as interactive", () => {
		// Routing (#736) runs before the answering agent on every message, so the
		// user waits on it. The default fallback is `pipeline`, which would hide
		// the routing tax in the background bucket.
		expect(surfaceForIntent(LLM_SPEND_INTENT.agent_routing)).toBe(
			LLM_SPEND_SURFACE.interactive
		);
	});

	it("treats background indexing work as pipeline", () => {
		expect(surfaceForIntent(LLM_SPEND_INTENT.entity_extraction)).toBe(
			LLM_SPEND_SURFACE.pipeline
		);
		expect(surfaceForIntent(LLM_SPEND_INTENT.shard_embedding)).toBe(
			LLM_SPEND_SURFACE.pipeline
		);
	});

	it("classifies every known intent", () => {
		for (const intent of Object.values(LLM_SPEND_INTENT)) {
			expect(
				[LLM_SPEND_SURFACE.interactive, LLM_SPEND_SURFACE.pipeline],
				intent
			).toContain(surfaceForIntent(intent));
		}
	});
});
