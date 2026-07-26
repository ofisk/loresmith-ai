import type { CostAlertThresholds } from "@/config/cost-alert-thresholds";
import type { LLMCostEventDAO } from "@/dao/llm-cost-event-dao";
import type {
	AlertSeverity,
	TelemetryAlert,
	TelemetryAlertsResponse,
} from "@/types/cost-attribution";

const HOUR_MS = 60 * 60 * 1000;

/**
 * How far past a threshold a value has to go before the alert escalates from
 * "warning" to "critical". 2x is a runaway loop, not a busy hour.
 */
const CRITICAL_MULTIPLIER = 2;

function severityFor(value: number, threshold: number): AlertSeverity {
	return value >= threshold * CRITICAL_MULTIPLIER ? "critical" : "warning";
}

function usd(value: number): string {
	return `$${value.toFixed(2)}`;
}

/**
 * Active cost-anomaly alerts, replacing the `handleGetAlerts` stub.
 *
 * Alerts are computed on read rather than stored: they are a view over the last
 * hour of `llm_cost_events`, so there is no state to reconcile and no chance of
 * a stale alert outliving the spend that caused it.
 */
export class AlertService {
	constructor(
		private dao: LLMCostEventDAO,
		private thresholds: CostAlertThresholds
	) {}

	async getActiveAlerts(
		now: Date = new Date()
	): Promise<TelemetryAlertsResponse> {
		const observedAt = now.toISOString();
		const response: TelemetryAlertsResponse = {
			alerts: [],
			thresholds: {
				userHourlySpendUsd: this.thresholds.userHourlySpendUsd,
				orgHourlySpendUsd: this.thresholds.orgHourlySpendUsd,
				unpricedShare: this.thresholds.unpricedShare,
			},
			lastUpdated: observedAt,
		};

		if (!(await this.dao.isAvailable())) {
			return response;
		}

		const since = new Date(now.getTime() - HOUR_MS).toISOString();
		const [perUser, totals] = await Promise.all([
			this.dao.getSpendByUserSince(since),
			this.dao.getTotals({ fromDate: since, toDate: observedAt }),
		]);

		const alerts: TelemetryAlert[] = [];

		// Per-user runaway spend — the case the issue calls out: one user or a
		// looping agent generating a surprise bill.
		for (const row of perUser) {
			if (row.costUsd < this.thresholds.userHourlySpendUsd) continue;
			alerts.push({
				id: `user_hourly_spend:${row.username}`,
				type: "user_hourly_spend",
				severity: severityFor(row.costUsd, this.thresholds.userHourlySpendUsd),
				title: `High hourly spend for ${row.username}`,
				detail: `${usd(row.costUsd)} across ${row.eventCount} LLM calls in the last hour (threshold ${usd(this.thresholds.userHourlySpendUsd)}).`,
				value: row.costUsd,
				threshold: this.thresholds.userHourlySpendUsd,
				username: row.username,
				observedAt,
			});
		}

		// Org-wide spend, which can cross the line without any single user doing so.
		if (totals.costUsd >= this.thresholds.orgHourlySpendUsd) {
			alerts.push({
				id: "org_hourly_spend",
				type: "org_hourly_spend",
				severity: severityFor(
					totals.costUsd,
					this.thresholds.orgHourlySpendUsd
				),
				title: "High org-wide hourly spend",
				detail: `${usd(totals.costUsd)} across ${totals.eventCount} LLM calls from ${totals.distinctUsers} users in the last hour (threshold ${usd(this.thresholds.orgHourlySpendUsd)}).`,
				value: totals.costUsd,
				threshold: this.thresholds.orgHourlySpendUsd,
				observedAt,
			});
		}

		// A data-quality alert: if too much spend has no rate-card entry, the
		// dollar figures above understate reality and the fix is to add the model
		// to `MODEL_RATES` rather than to investigate a user.
		if (totals.eventCount > 0) {
			const unpricedShare = totals.unpricedEvents / totals.eventCount;
			if (unpricedShare >= this.thresholds.unpricedShare) {
				alerts.push({
					id: "unpriced_spend",
					type: "unpriced_spend",
					severity: "info",
					title: "Cost figures are understated",
					detail: `${totals.unpricedEvents} of ${totals.eventCount} calls in the last hour could not be priced (${(unpricedShare * 100).toFixed(0)}%). Add the missing models to MODEL_RATES in src/config/model-pricing.ts.`,
					value: unpricedShare,
					threshold: this.thresholds.unpricedShare,
					observedAt,
				});
			}
		}

		const order: Record<AlertSeverity, number> = {
			critical: 0,
			warning: 1,
			info: 2,
		};
		alerts.sort(
			(a, b) => order[a.severity] - order[b.severity] || b.value - a.value
		);

		response.alerts = alerts;
		return response;
	}
}
