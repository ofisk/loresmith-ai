/**
 * Free-tier token allowance (issue #746).
 *
 * The free tier used to be a single one-time bucket of 150k tokens that never
 * reset, so an account went permanently inert once it drained. LoreSmith's
 * value is cumulative — it only beats a general chatbot after a campaign has
 * several sessions of digests and an indexed source book — and a token bucket
 * expires long before that. The trial was denominated in tokens; the payoff is
 * denominated in sessions elapsed.
 *
 * So the free tier now has **two** buckets:
 *
 * - a one-time **welcome grant** (`trialTokens`), sized for the expensive
 *   onboarding burst: indexing a rulebook, creating a campaign, a first
 *   session readout; and
 * - a recurring **monthly allowance** (`monthlyTokens`) that refreshes on the
 *   first of each month, so an account is never permanently dead.
 *
 * Spend draws from the **monthly bucket first** and overflows into the welcome
 * grant. That ordering matters: it preserves the grant for the months a user
 * actually runs long, rather than burning it in the first week on work the
 * recurring allowance would have covered anyway.
 *
 * Purchased credits sit on top of both and are never consumed by this
 * accounting — they raise the ceiling, matching the existing behaviour of
 * `user_indexing_credits`.
 */

export interface FreeTierBuckets {
	/** One-time welcome grant, in tokens. Zero if the tier has no grant. */
	trialTokens: number;
	/** Recurring per-calendar-month allowance. Zero if the tier has none. */
	monthlyTokens: number;
	/** Tokens drawn from the welcome grant, all time. */
	trialUsed: number;
	/** Tokens drawn from the current calendar month's allowance. */
	monthUsed: number;
	/** Purchased one-off credits; additive, never drawn down here. */
	credits: number;
}

export interface FreeTierAllowance {
	/** Unused tokens in this month's allowance. */
	monthRemaining: number;
	/** Unused tokens in the one-time welcome grant. */
	trialRemaining: number;
	/** Purchased credits, clamped to zero. */
	credits: number;
	/** Total tokens the user may still spend. */
	remaining: number;
	/** Total capacity currently available, for display. */
	limit: number;
	/** Tokens spent against `limit`, for display. Always `limit - remaining`. */
	used: number;
	/** True when no bucket has capacity left. */
	exhausted: boolean;
}

/**
 * Combine both buckets plus credits into the numbers quota checks and the
 * billing UI need.
 *
 * `used` is derived as `limit - remaining` rather than summed from the raw
 * counters so the pair stays consistent even when a counter overshoots its
 * bucket — usage is recorded after a call completes, so the last spend of a
 * month can land over the line.
 */
export function computeFreeTierAllowance(
	buckets: FreeTierBuckets
): FreeTierAllowance {
	const monthRemaining = Math.max(0, buckets.monthlyTokens - buckets.monthUsed);
	const trialRemaining = Math.max(0, buckets.trialTokens - buckets.trialUsed);
	const credits = Math.max(0, buckets.credits);

	const remaining = monthRemaining + trialRemaining + credits;
	const limit = buckets.monthlyTokens + buckets.trialTokens + credits;

	return {
		monthRemaining,
		trialRemaining,
		credits,
		remaining,
		limit,
		used: limit - remaining,
		exhausted: remaining <= 0,
	};
}

/**
 * Split a completed spend across the two buckets, monthly first.
 *
 * Anything beyond the monthly allowance lands on the welcome grant. Once both
 * are drained the overflow still accrues to the grant counter, which keeps the
 * ledger honest for spend covered by purchased credits.
 */
export function splitSpendAcrossBuckets(
	tokens: number,
	monthlyTokens: number,
	monthUsed: number
): { toMonthly: number; toTrial: number } {
	const spend = Math.max(0, tokens);
	const monthRemaining = Math.max(0, monthlyTokens - monthUsed);
	const toMonthly = Math.min(spend, monthRemaining);
	return { toMonthly, toTrial: spend - toMonthly };
}

/**
 * Start of the next calendar month — when the monthly allowance refreshes.
 *
 * Uses local-time field accessors to match `UserMonthlyUsageDAO`'s
 * `year_month` key, which is built the same way. Workers run in UTC, so the
 * two agree in every deployed environment.
 */
export function nextMonthlyResetAt(now: Date = new Date()): string {
	return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
}
