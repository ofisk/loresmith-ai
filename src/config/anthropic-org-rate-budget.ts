/**
 * Anthropic API org capacity → LoreSmith per-user rate limits.
 *
 * Update `ANTHROPIC_ORG_LIMITS` when your Console “Limits” page changes (tier, model rows).
 * Tune `ORG_RATE_BUDGET_ASSUMPTIONS` for expected peak concurrency and safety margin.
 *
 * Derived limits split **input** token budget (ITPM) and **request** budget (RPM) across
 * `expectedConcurrentActiveUsers`. Basic tier receives that share; Pro is 2× Basic (historic
 * product ratio); Free uses fixed fractions of Basic for trial pacing.
 *
 * Non-rate fields (campaign/file caps, storage, retries, resources/hour) stay in `app-constants.ts`.
 */

/** Values from Anthropic Console → Organization → Limits (example: Tier 4). */
export const ANTHROPIC_ORG_LIMITS = {
	/** Sonnet / Opus row (same RPM & token ceilings in Console). */
	primary: {
		requestsPerMinute: 4_000,
		inputTokensPerMinute: 2_000_000,
		outputTokensPerMinute: 400_000,
	},
	opus: {
		requestsPerMinute: 4_000,
		inputTokensPerMinute: 2_000_000,
		outputTokensPerMinute: 400_000,
	},
	/** Haiku row — informational; enforcement below uses `primary` unless you switch. */
	haiku: {
		requestsPerMinute: 4_000,
		inputTokensPerMinute: 4_000_000,
		outputTokensPerMinute: 800_000,
	},
	batchRequestsPerMinute: 4_000,
} as const;

/**
 * Which org row drives **input token** and **request** budgets for `deriveSubscriptionTierRates`.
 * Change to `"haiku"` if your app is dominated by Haiku and you want to size from that column.
 */
export const ORG_LIMIT_ROW_FOR_ENFORCEMENT: "primary" | "haiku" = "primary";

export const ORG_RATE_BUDGET_ASSUMPTIONS = {
	/**
	 * Expected **simultaneously active** users (chat + indexing + background jobs attributed to users).
	 * Higher N → smaller per-user share of org TPM/RPM.
	 */
	expectedConcurrentActiveUsers: 20,

	/**
	 * Fraction of org capacity reserved for burst, retries, admin, and non-user traffic (0–1).
	 * e.g. 0.85 leaves 15% headroom below Anthropic’s hard ceiling.
	 */
	headroom: 0.85,
} as const;

export interface TierRateLimits {
	tph: number;
	qph: number;
	tpd: number;
	qpd: number;
}

function pickOrgRow() {
	return ORG_LIMIT_ROW_FOR_ENFORCEMENT === "haiku"
		? ANTHROPIC_ORG_LIMITS.haiku
		: ANTHROPIC_ORG_LIMITS.primary;
}

/**
 * Computes per-tier hourly/daily token and query caps from org limits and concurrency assumptions.
 * Basic = fair share of org RPM/ITPM; Pro = 2× Basic; Free = trial-style fractions of Basic.
 */
export function deriveSubscriptionTierRates(): {
	free: TierRateLimits;
	basic: TierRateLimits;
	pro: TierRateLimits;
} {
	const row = pickOrgRow();
	const n = Math.max(
		1,
		Math.floor(ORG_RATE_BUDGET_ASSUMPTIONS.expectedConcurrentActiveUsers)
	);
	const headroom = ORG_RATE_BUDGET_ASSUMPTIONS.headroom;

	const inputTokensPerHourOrg = row.inputTokensPerMinute * 60;
	const requestsPerHourOrg = row.requestsPerMinute * 60;

	const baseTph = Math.floor((inputTokensPerHourOrg * headroom) / n);
	const baseQph = Math.floor((requestsPerHourOrg * headroom) / n);

	/** Historic Basic ratio: daily cap was 5/6 of “one hour at max tph” for tokens and queries. */
	const tpdBasic = Math.floor(baseTph * (500_000 / 600_000));
	const qpdBasic = Math.floor(baseQph * (500 / 600));

	const basic: TierRateLimits = {
		tph: baseTph,
		qph: baseQph,
		tpd: tpdBasic,
		qpd: qpdBasic,
	};

	/** Historic Free vs Basic: tph 20%, qph 50%; tpd/qpd small fractions of Basic daily caps. */
	const free: TierRateLimits = {
		tph: Math.floor(baseTph * 0.2),
		qph: Math.floor(baseQph * 0.5),
		tpd: Math.max(1_000, Math.floor(tpdBasic * 0.02)),
		qpd: Math.max(10, Math.floor(qpdBasic * 0.1)),
	};

	/** Historic Pro = 2× Basic on all four rate limits. */
	const pro: TierRateLimits = {
		tph: baseTph * 2,
		qph: baseQph * 2,
		tpd: tpdBasic * 2,
		qpd: qpdBasic * 2,
	};

	return { free, basic, pro };
}
