import { describe, expect, it } from "vitest";
import { deriveBatchRequestBudget } from "@/config/anthropic-org-rate-budget";
import {
	batchDeadlineFrom,
	LLM_BATCH_DEADLINE_MINUTES,
	parseBatchTimestampMs,
} from "@/services/llm/llm-batch-config";

describe("parseBatchTimestampMs", () => {
	it("reads a bare D1 datetime as UTC, not local time", () => {
		expect(parseBatchTimestampMs("2026-07-26 10:00:00")).toBe(
			Date.parse("2026-07-26T10:00:00Z")
		);
	});

	it("reads an ISO timestamp with an explicit zone", () => {
		expect(parseBatchTimestampMs("2026-07-26T10:00:00.000Z")).toBe(
			Date.parse("2026-07-26T10:00:00.000Z")
		);
	});

	it("returns null for an unparseable value so callers can decide", () => {
		expect(parseBatchTimestampMs("not a date")).toBeNull();
		expect(parseBatchTimestampMs("")).toBeNull();
	});
});

describe("batchDeadlineFrom", () => {
	it("is the configured number of minutes ahead", () => {
		const now = new Date("2026-07-26T10:00:00.000Z");
		expect(parseBatchTimestampMs(batchDeadlineFrom(now))).toBe(
			now.getTime() + LLM_BATCH_DEADLINE_MINUTES * 60_000
		);
	});
});

describe("deriveBatchRequestBudget", () => {
	it("derives a positive per-user share of the org batch line", () => {
		const budget = deriveBatchRequestBudget();
		expect(budget.requestsPerMinuteOrg).toBeGreaterThan(0);
		expect(budget.requestsPerMinutePerUser).toBeGreaterThan(0);
		expect(budget.requestsPerMinutePerUser).toBeLessThan(
			budget.requestsPerMinuteOrg
		);
	});
});
