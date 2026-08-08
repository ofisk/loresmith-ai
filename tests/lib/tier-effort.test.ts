import { describe, expect, it } from "vitest";
import type { TextGenerationTier } from "@/app-constants";
import {
	anthropicBatchModelParams,
	anthropicSamplingParams,
	DEFAULT_SONNET5_EFFORT,
	effortForTier,
} from "@/lib/anthropic-model-options";

const ALL_TIERS: TextGenerationTier[] = [
	"PRIMARY",
	"INTERACTIVE",
	"ANALYSIS",
	"PIPELINE_STRUCTURED",
	"PIPELINE_LIGHT",
	"PIPELINE_ANALYSIS",
	"METADATA_ANALYSIS",
	"SESSION_PLANNING",
];

describe("effortForTier", () => {
	// The point of the table is that a sweep can change one row. Until a sweep
	// has actually been run and its quality impact recorded, every row must still
	// read the previous global default — otherwise this shipped an unmeasured
	// quality change disguised as a refactor.
	it("leaves every tier at the previous global default", () => {
		for (const tier of ALL_TIERS) {
			expect(effortForTier(tier)).toBe(DEFAULT_SONNET5_EFFORT);
		}
	});

	it("covers every declared tier", () => {
		for (const tier of ALL_TIERS) {
			expect(effortForTier(tier)).toBeDefined();
		}
	});

	it("falls back rather than throwing on an absent or unknown tier", () => {
		expect(effortForTier(undefined)).toBe(DEFAULT_SONNET5_EFFORT);
		expect(effortForTier("NOT_A_TIER" as TextGenerationTier)).toBe(
			DEFAULT_SONNET5_EFFORT
		);
	});
});

describe("anthropicSamplingParams", () => {
	it("sends the tier's effort on Sonnet 5", () => {
		const params = anthropicSamplingParams(
			"claude-sonnet-5",
			0.7,
			"PIPELINE_STRUCTURED"
		);
		expect(params.providerOptions?.anthropic.effort).toBe(
			effortForTier("PIPELINE_STRUCTURED")
		);
		expect(params.temperature).toBeUndefined();
	});

	it("behaves exactly as before when no tier is supplied", () => {
		expect(anthropicSamplingParams("claude-sonnet-5", 0.7)).toEqual(
			anthropicSamplingParams("claude-sonnet-5", 0.7, undefined)
		);
	});

	// Haiku takes no effort parameter, so a tier must not start smuggling one in.
	it("ignores the tier on models that take no effort", () => {
		const params = anthropicSamplingParams(
			"claude-haiku-4-5",
			0.3,
			"PIPELINE_LIGHT"
		);
		expect(params.providerOptions).toBeUndefined();
		expect(params.temperature).toBe(0.3);
	});
});

describe("anthropicBatchModelParams", () => {
	it("uses the tier's effort on the batch path too", () => {
		const params = anthropicBatchModelParams(
			"claude-sonnet-5",
			0.1,
			"PIPELINE_STRUCTURED"
		);
		expect(params.output_config?.effort).toBe(
			effortForTier("PIPELINE_STRUCTURED")
		);
	});

	it("keeps its previous behaviour when no tier is supplied", () => {
		expect(anthropicBatchModelParams("claude-sonnet-5", 0.1)).toEqual({
			output_config: { effort: DEFAULT_SONNET5_EFFORT },
		});
	});
});
