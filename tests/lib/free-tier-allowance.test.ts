import { describe, expect, it } from "vitest";
import {
	computeFreeTierAllowance,
	nextMonthlyResetAt,
	splitSpendAcrossBuckets,
} from "@/lib/free-tier-allowance";

const MONTHLY = 50_000;
const GRANT = 150_000;

function allowance(
	over: Partial<Parameters<typeof computeFreeTierAllowance>[0]>
) {
	return computeFreeTierAllowance({
		monthlyTokens: MONTHLY,
		trialTokens: GRANT,
		monthUsed: 0,
		trialUsed: 0,
		credits: 0,
		...over,
	});
}

describe("computeFreeTierAllowance", () => {
	it("gives a brand-new free account both buckets", () => {
		const result = allowance({});
		expect(result.remaining).toBe(MONTHLY + GRANT);
		expect(result.limit).toBe(MONTHLY + GRANT);
		expect(result.used).toBe(0);
		expect(result.exhausted).toBe(false);
	});

	it("keeps `used` and `remaining` complementary", () => {
		const result = allowance({ monthUsed: 20_000, trialUsed: 30_000 });
		expect(result.used).toBe(50_000);
		expect(result.remaining).toBe(result.limit - result.used);
	});

	// The whole point of the issue: draining the one-time grant must not end
	// free usage, because the monthly bucket still has capacity.
	it("is not exhausted when the welcome grant is gone but the month has room", () => {
		const result = allowance({ trialUsed: GRANT, monthUsed: 0 });
		expect(result.trialRemaining).toBe(0);
		expect(result.monthRemaining).toBe(MONTHLY);
		expect(result.exhausted).toBe(false);
	});

	it("is exhausted only when both buckets and credits are empty", () => {
		const result = allowance({ trialUsed: GRANT, monthUsed: MONTHLY });
		expect(result.remaining).toBe(0);
		expect(result.exhausted).toBe(true);
	});

	it("counts purchased credits on top of both buckets", () => {
		const result = allowance({
			trialUsed: GRANT,
			monthUsed: MONTHLY,
			credits: 10_000,
		});
		expect(result.remaining).toBe(10_000);
		expect(result.exhausted).toBe(false);
	});

	// Usage is recorded after a call completes, so the last spend of a month
	// routinely lands past the line. Reported usage must not exceed the limit.
	it("clamps an overshooting counter instead of reporting usage above the limit", () => {
		const result = allowance({ monthUsed: MONTHLY + 9_000, trialUsed: 0 });
		expect(result.monthRemaining).toBe(0);
		expect(result.used).toBe(MONTHLY);
		expect(result.used).toBeLessThanOrEqual(result.limit);
	});

	it("treats a tier with no buckets as exhausted", () => {
		const result = computeFreeTierAllowance({
			monthlyTokens: 0,
			trialTokens: 0,
			monthUsed: 0,
			trialUsed: 0,
			credits: 0,
		});
		expect(result.exhausted).toBe(true);
	});
});

describe("splitSpendAcrossBuckets", () => {
	it("draws entirely from the monthly bucket while it has room", () => {
		expect(splitSpendAcrossBuckets(10_000, MONTHLY, 0)).toEqual({
			toMonthly: 10_000,
			toTrial: 0,
		});
	});

	it("splits a spend that straddles the monthly ceiling", () => {
		expect(splitSpendAcrossBuckets(10_000, MONTHLY, 45_000)).toEqual({
			toMonthly: 5_000,
			toTrial: 5_000,
		});
	});

	it("sends the whole spend to the grant once the month is spent", () => {
		expect(splitSpendAcrossBuckets(10_000, MONTHLY, MONTHLY)).toEqual({
			toMonthly: 0,
			toTrial: 10_000,
		});
	});

	it("puts everything on the grant when there is no monthly allowance", () => {
		expect(splitSpendAcrossBuckets(10_000, 0, 0)).toEqual({
			toMonthly: 0,
			toTrial: 10_000,
		});
	});

	it("never loses or invents tokens", () => {
		for (const monthUsed of [0, 25_000, 49_999, MONTHLY, MONTHLY + 1]) {
			const { toMonthly, toTrial } = splitSpendAcrossBuckets(
				7_777,
				MONTHLY,
				monthUsed
			);
			expect(toMonthly + toTrial).toBe(7_777);
			expect(toMonthly).toBeGreaterThanOrEqual(0);
			expect(toTrial).toBeGreaterThanOrEqual(0);
		}
	});

	it("ignores a negative spend rather than crediting the buckets", () => {
		expect(splitSpendAcrossBuckets(-500, MONTHLY, 0)).toEqual({
			toMonthly: 0,
			toTrial: 0,
		});
	});
});

describe("nextMonthlyResetAt", () => {
	it("returns the first of the following month", () => {
		const reset = new Date(nextMonthlyResetAt(new Date(2026, 7, 8)));
		expect(reset.getFullYear()).toBe(2026);
		expect(reset.getMonth()).toBe(8); // September
		expect(reset.getDate()).toBe(1);
	});

	it("rolls over the year in December", () => {
		const reset = new Date(nextMonthlyResetAt(new Date(2026, 11, 31)));
		expect(reset.getFullYear()).toBe(2027);
		expect(reset.getMonth()).toBe(0);
	});
});
