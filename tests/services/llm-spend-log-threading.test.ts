import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const insertUsage = vi.fn();
const insertEvent = vi.fn();
const incrementUsage = vi.fn();

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: () => ({
		llmUsageDAO: { insertUsage },
		llmCostEventDAO: { insertEvent },
		userFreeTierUsageDAO: { incrementUsage },
		userMonthlyUsageDAO: { incrementUsage },
	}),
}));

vi.mock("@/services/billing/subscription-service", () => ({
	getSubscriptionService: () => ({
		getTier: async () => "basic",
		getTierLimits: () => ({}),
	}),
}));

import { LLM_SPEND_INTENT } from "@/lib/llm-usage-intents";
import { LLM_SPEND_VERBOSE_ENV } from "@/lib/llm-usage-verbose-log";
import * as loggerModule from "@/lib/logger";
import { LLMRateLimitService } from "@/services/llm/llm-rate-limit-service";

/**
 * Pins the invariant that broke `llm_token_spend`: `recordUsage` destructures
 * fields out of `meta` to keep them from landing in `extras`, and anything it
 * pulls out but does not re-attach vanishes from the drain entirely.
 *
 * Cache-read tokens are the field that matters most. They are the only proof a
 * `cache_control` breakpoint is being honoured — a breakpoint that never hits
 * and one that always hits produce identical `tokens` totals — and the issue's
 * own verification recipe says to read them from this log.
 */
describe("recordUsage → llm_token_spend", () => {
	let info: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		info = vi.fn();
		vi.spyOn(loggerModule, "createLogger").mockReturnValue({
			info,
			warn: vi.fn(),
		} as unknown as ReturnType<typeof loggerModule.createLogger>);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		insertUsage.mockReset();
		insertEvent.mockReset();
	});

	function serviceWithVerboseLogging() {
		return new LLMRateLimitService({
			[LLM_SPEND_VERBOSE_ENV]: "true",
		} as never);
	}

	function loggedPayload() {
		const call = info.mock.calls.find((c) => c[0] === "llm_token_spend");
		expect(call, "no llm_token_spend line was emitted").toBeDefined();
		return call?.[1] as Record<string, unknown>;
	}

	it("carries the cache split onto the log line", async () => {
		await serviceWithVerboseLogging().recordUsage("alice", 900, 1, "model-x", {
			intent: LLM_SPEND_INTENT.user_prompt,
			promptTokens: 100,
			completionTokens: 50,
			cachedInputTokens: 700,
			cacheWriteTokens: 50,
		});

		expect(loggedPayload()).toMatchObject({
			cachedInputTokens: 700,
			cacheWriteTokens: 50,
			promptTokens: 100,
			completionTokens: 50,
		});
	});

	it("carries the attribution fields the drain groups by", async () => {
		await serviceWithVerboseLogging().recordUsage("alice", 10, 1, "model-x", {
			intent: LLM_SPEND_INTENT.user_prompt,
			modelRole: "PIPELINE_STRUCTURED",
			agent: "CampaignAgent",
			provider: "anthropic",
		});

		expect(loggedPayload()).toMatchObject({
			modelRole: "PIPELINE_STRUCTURED",
			agent: "CampaignAgent",
			provider: "anthropic",
		});
	});

	it("carries retry attempts and effort", async () => {
		await serviceWithVerboseLogging().recordUsage("alice", 10, 1, "model-x", {
			intent: LLM_SPEND_INTENT.user_prompt,
			attempts: 3,
			effort: "medium",
		});

		expect(loggedPayload()).toMatchObject({ attempts: 3, effort: "medium" });
	});

	// These fields are optional everywhere upstream, so absent must stay absent
	// rather than becoming a zero that reads as a real measurement.
	it("omits the diagnostics when the provider did not report them", async () => {
		await serviceWithVerboseLogging().recordUsage("alice", 10, 1, "model-x", {
			intent: LLM_SPEND_INTENT.user_prompt,
		});

		const payload = loggedPayload();
		expect(payload.attempts).toBeUndefined();
		expect(payload.effort).toBeUndefined();
	});

	// Non-numeric junk arriving through the `Record<string, unknown>` half of
	// LlmSpendLogMeta must not be presented as a measured attempt count.
	it("drops a non-numeric attempts value rather than logging it", async () => {
		await serviceWithVerboseLogging().recordUsage("alice", 10, 1, "model-x", {
			intent: LLM_SPEND_INTENT.user_prompt,
			attempts: "lots",
		});

		expect(loggedPayload().attempts).toBeUndefined();
	});

	it("still records the ledger row and the cost event", async () => {
		await serviceWithVerboseLogging().recordUsage("alice", 10, 1, "model-x", {
			intent: LLM_SPEND_INTENT.user_prompt,
			promptTokens: 8,
			completionTokens: 2,
		});

		expect(insertUsage).toHaveBeenCalledWith("alice", 10, 1, "model-x");
		expect(insertEvent).toHaveBeenCalledTimes(1);
	});
});
