import type { LlmSpendSurface } from "@/lib/llm-usage-intents";

/**
 * Shapes for the admin cost-attribution view (issue #738). Shared by the
 * telemetry route and the React dashboard so both sides move together.
 */

/** Dimensions spend can be sliced by. Each maps to one `llm_cost_events` column. */
export type CostDimension =
	| "agent"
	| "intent"
	| "model"
	| "modelRole"
	| "surface"
	| "tier";

export interface CostBreakdownRow {
	/** Dimension value; "unattributed" when the column was NULL. */
	key: string;
	costUsd: number;
	/** Share of the window's total priced spend, 0–1. */
	costShare: number;
	totalTokens: number;
	promptTokens: number;
	completionTokens: number;
	cachedInputTokens: number;
	cacheWriteTokens: number;
	queryCount: number;
	eventCount: number;
	/** Events whose model had no rate-card entry, so cost excludes them. */
	unpricedEvents: number;
}

export interface CostTotals {
	costUsd: number;
	totalTokens: number;
	promptTokens: number;
	completionTokens: number;
	cachedInputTokens: number;
	cacheWriteTokens: number;
	queryCount: number;
	eventCount: number;
	unpricedEvents: number;
	distinctUsers: number;
	/**
	 * Cache reads as a share of all input tokens (cached + uncached), 0–1.
	 * The headline metric for prompt-caching work.
	 */
	cacheHitRate: number;
}

/** Cost-to-serve per subscription tier — the tier-solvency number. */
export interface CostPerTierRow {
	tier: string;
	costUsd: number;
	userCount: number;
	/** costUsd / userCount over the window. */
	costPerUserUsd: number;
	totalTokens: number;
	eventCount: number;
}

export interface TopSpenderRow {
	username: string;
	tier: string;
	costUsd: number;
	totalTokens: number;
	eventCount: number;
}

export interface CostAttributionResponse {
	window: { from: string; to: string };
	totals: CostTotals;
	byAgent: CostBreakdownRow[];
	byIntent: CostBreakdownRow[];
	byModel: CostBreakdownRow[];
	byModelRole: CostBreakdownRow[];
	bySurface: CostBreakdownRow[];
	byTier: CostBreakdownRow[];
	costPerTier: CostPerTierRow[];
	topSpenders: TopSpenderRow[];
	lastUpdated: string;
}

/** Severity ordering used for sorting and colour in the dashboard. */
export type AlertSeverity = "info" | "warning" | "critical";

export interface TelemetryAlert {
	id: string;
	type: "user_hourly_spend" | "org_hourly_spend" | "unpriced_spend";
	severity: AlertSeverity;
	title: string;
	detail: string;
	/** Measured value that triggered the alert (USD, or a ratio for share alerts). */
	value: number;
	/** Threshold the value crossed. */
	threshold: number;
	/** Present on per-user alerts. */
	username?: string;
	observedAt: string;
}

export interface TelemetryAlertsResponse {
	alerts: TelemetryAlert[];
	thresholds: {
		userHourlySpendUsd: number;
		orgHourlySpendUsd: number;
		unpricedShare: number;
	};
	lastUpdated: string;
}

export type { LlmSpendSurface };
