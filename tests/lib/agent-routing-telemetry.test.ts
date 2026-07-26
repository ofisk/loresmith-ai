import { describe, expect, it } from "vitest";
import {
	confidenceBucket,
	logRoutingDecision,
} from "../../src/lib/agent-routing-telemetry";

describe("confidenceBucket", () => {
	it("buckets the confidence range", () => {
		expect(confidenceBucket(100)).toBe("90-100");
		expect(confidenceBucket(90)).toBe("90-100");
		expect(confidenceBucket(89)).toBe("70-89");
		expect(confidenceBucket(70)).toBe("70-89");
		expect(confidenceBucket(50)).toBe("50-69");
		expect(confidenceBucket(30)).toBe("30-49");
		expect(confidenceBucket(0)).toBe("0-29");
	});

	it("handles non-finite values", () => {
		expect(confidenceBucket(Number.NaN)).toBe("unknown");
	});
});

describe("logRoutingDecision", () => {
	const decision = {
		source: "llm" as const,
		agent: "recap",
		confidence: 90,
		reason: "LLM-based routing",
	};

	it("is a no-op when verbose LLM logging is off", () => {
		expect(() => logRoutingDecision(undefined, decision)).not.toThrow();
		expect(() =>
			logRoutingDecision({ LORESMITH_VERBOSE_LLM_USAGE: "false" }, decision)
		).not.toThrow();
	});

	it("does not throw when logging is enabled", () => {
		expect(() =>
			logRoutingDecision(
				{ LORESMITH_VERBOSE_LLM_USAGE: "true" },
				{
					...decision,
					advisoryAgent: "rules-reference",
					advisoryAgreed: false,
					rule: "advisory:rules-reference",
					latencyMs: 42,
					model: "claude-haiku-4-5",
				}
			)
		).not.toThrow();
	});
});
