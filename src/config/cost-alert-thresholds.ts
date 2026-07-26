/**
 * Thresholds for cost-anomaly alerting (issue #738).
 *
 * These are deliberately absolute dollar figures rather than being derived from
 * `SUBSCRIPTION_TIERS`. Rate limits already stop a normal user from exceeding
 * their tier, so alerting at the tier ceiling would only ever fire on traffic
 * the system already decided was fine. The spend these alerts exist to catch is
 * the spend that bypasses those limits: admin accounts (which skip `checkLimit`
 * entirely) and background pipeline work attributed to a user.
 *
 * Override per environment with the matching env vars when a deployment's normal
 * volume differs from these defaults.
 */

export const COST_ALERT_ENV = {
	userHourlySpendUsd: "LORESMITH_ALERT_USER_HOURLY_USD",
	orgHourlySpendUsd: "LORESMITH_ALERT_ORG_HOURLY_USD",
	unpricedShare: "LORESMITH_ALERT_UNPRICED_SHARE",
} as const;

export interface CostAlertThresholds {
	/** One user's spend in a rolling hour. */
	userHourlySpendUsd: number;
	/** All users' combined spend in a rolling hour. */
	orgHourlySpendUsd: number;
	/**
	 * Share of events (0–1) with no rate-card entry before we warn that the
	 * dashboard's dollar figures are materially understated.
	 */
	unpricedShare: number;
}

export const DEFAULT_COST_ALERT_THRESHOLDS: CostAlertThresholds = {
	userHourlySpendUsd: 5,
	orgHourlySpendUsd: 50,
	unpricedShare: 0.2,
};

function readNumber(
	env: Record<string, unknown> | undefined,
	key: string,
	fallback: number
): number {
	const raw = env?.[key];
	const parsed =
		typeof raw === "number"
			? raw
			: typeof raw === "string"
				? Number.parseFloat(raw)
				: Number.NaN;
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveCostAlertThresholds(
	env?: Record<string, unknown>
): CostAlertThresholds {
	return {
		userHourlySpendUsd: readNumber(
			env,
			COST_ALERT_ENV.userHourlySpendUsd,
			DEFAULT_COST_ALERT_THRESHOLDS.userHourlySpendUsd
		),
		orgHourlySpendUsd: readNumber(
			env,
			COST_ALERT_ENV.orgHourlySpendUsd,
			DEFAULT_COST_ALERT_THRESHOLDS.orgHourlySpendUsd
		),
		unpricedShare: readNumber(
			env,
			COST_ALERT_ENV.unpricedShare,
			DEFAULT_COST_ALERT_THRESHOLDS.unpricedShare
		),
	};
}
