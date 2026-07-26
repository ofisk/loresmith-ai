import { describe, expect, it } from "vitest";
import {
	estimateCostUsd,
	MODEL_RATES,
	resolveModelRate,
} from "@/config/model-pricing";

describe("resolveModelRate", () => {
	it("resolves an exact model id", () => {
		expect(resolveModelRate("claude-sonnet-5")?.key).toBe("claude-sonnet-5");
	});

	it("is case- and whitespace-insensitive", () => {
		expect(resolveModelRate("  Claude-Haiku-4-5 ")?.key).toBe(
			"claude-haiku-4-5"
		);
	});

	it("resolves a dated snapshot to its base alias", () => {
		expect(resolveModelRate("claude-haiku-4-5-20251001")?.key).toBe(
			"claude-haiku-4-5"
		);
	});

	it("prefers the longest matching prefix", () => {
		// A naive prefix match could resolve this to a shorter opus key.
		expect(resolveModelRate("claude-opus-4-6-20251101")?.key).toBe(
			"claude-opus-4-6"
		);
	});

	it("returns null for an unknown model rather than guessing", () => {
		expect(resolveModelRate("some-new-model")).toBeNull();
		expect(resolveModelRate(undefined)).toBeNull();
		expect(resolveModelRate("")).toBeNull();
	});
});

describe("estimateCostUsd", () => {
	it("prices input and output at their separate rates", () => {
		// Sonnet 5 list: $3/MTok in, $15/MTok out.
		const result = estimateCostUsd("claude-sonnet-5", {
			promptTokens: 1_000_000,
			completionTokens: 1_000_000,
		});
		expect(result.priced).toBe(true);
		expect(result.costUsd).toBeCloseTo(18, 6);
	});

	it("charges output tokens more than input tokens", () => {
		const input = estimateCostUsd("claude-sonnet-5", { promptTokens: 1000 });
		const output = estimateCostUsd("claude-sonnet-5", {
			completionTokens: 1000,
		});
		expect(output.costUsd).toBeGreaterThan(input.costUsd);
	});

	it("prices cache reads at a tenth of input by default", () => {
		const uncached = estimateCostUsd("claude-haiku-4-5", {
			promptTokens: 1_000_000,
		});
		const cached = estimateCostUsd("claude-haiku-4-5", {
			cachedInputTokens: 1_000_000,
		});
		expect(cached.costUsd).toBeCloseTo(uncached.costUsd * 0.1, 6);
	});

	it("prices cache writes above uncached input", () => {
		const uncached = estimateCostUsd("claude-haiku-4-5", {
			promptTokens: 1_000_000,
		});
		const written = estimateCostUsd("claude-haiku-4-5", {
			cacheWriteTokens: 1_000_000,
		});
		expect(written.costUsd).toBeCloseTo(uncached.costUsd * 1.25, 6);
	});

	it("reports unknown models as unpriced with zero cost", () => {
		const result = estimateCostUsd("not-a-real-model", {
			promptTokens: 1_000_000,
			completionTokens: 1_000_000,
		});
		expect(result.priced).toBe(false);
		expect(result.costUsd).toBe(0);
	});

	it("flags rates that have not been verified against the provider", () => {
		expect(
			estimateCostUsd("gpt-4o-mini", { promptTokens: 10 }).unverified
		).toBe(true);
		expect(
			estimateCostUsd("claude-sonnet-5", { promptTokens: 10 }).unverified
		).toBe(false);
	});

	it("treats a missing breakdown as zero cost, not NaN", () => {
		const result = estimateCostUsd("claude-sonnet-5", {});
		expect(result.costUsd).toBe(0);
		expect(Number.isNaN(result.costUsd)).toBe(false);
	});

	it("keeps every rate positive so a typo cannot zero out a model", () => {
		for (const [model, rate] of Object.entries(MODEL_RATES)) {
			expect(rate.inputPerMTok, `${model} input`).toBeGreaterThan(0);
			expect(rate.outputPerMTok, `${model} output`).toBeGreaterThanOrEqual(0);
		}
	});
});
