import {
	useCostAttribution,
	useTelemetryAlerts,
} from "@/hooks/useCostAttribution";
import type {
	CostBreakdownRow,
	TelemetryAlert,
} from "@/types/cost-attribution";

/**
 * Per-agent / per-intent cost attribution (issue #738).
 *
 * Every breakdown here answers a magnitude question ("which of these spends the
 * most"), so each is a ranked single-series bar in one hue rather than a
 * categorical palette — identity comes from the row label, and the value is
 * direct-labeled so the chart never hides a number behind colour.
 */

function formatUsd(value: number): string {
	if (value === 0) return "$0.00";
	// Sub-cent spend is common per-call; showing "$0.00" would read as free.
	if (Math.abs(value) < 0.01) return `$${value.toFixed(4)}`;
	return `$${value.toFixed(2)}`;
}

function formatCompact(value: number): string {
	return new Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
}

function formatPercent(fraction: number): string {
	return `${(fraction * 100).toFixed(1)}%`;
}

function StatTile({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint?: string;
}) {
	return (
		<div className="min-w-0">
			<div className="text-sm text-neutral-600 dark:text-neutral-400">
				{label}
			</div>
			<div className="text-2xl font-bold tabular-nums truncate">{value}</div>
			{hint ? (
				<div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
					{hint}
				</div>
			) : null}
		</div>
	);
}

/**
 * Ranked horizontal bars. Bars are scaled to the largest row so the shape stays
 * readable even when one dimension dominates; the label carries the true share
 * of total spend.
 */
function SpendBars({
	title,
	description,
	rows,
	emptyLabel,
}: {
	title: string;
	description: string;
	rows: CostBreakdownRow[];
	emptyLabel: string;
}) {
	const max = rows.reduce((acc, row) => Math.max(acc, row.costUsd), 0);

	return (
		<div className="min-w-0">
			<h3 className="text-base font-medium">{title}</h3>
			<p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
				{description}
			</p>
			{rows.length === 0 ? (
				<div className="text-sm text-neutral-500 dark:text-neutral-400">
					{emptyLabel}
				</div>
			) : (
				<ul className="space-y-2">
					{rows.map((row) => (
						<li key={row.key} className="min-w-0">
							<div className="flex items-baseline justify-between gap-3 text-sm">
								<span className="truncate font-medium" title={row.key}>
									{row.key}
								</span>
								<span className="tabular-nums whitespace-nowrap text-neutral-600 dark:text-neutral-400">
									{formatUsd(row.costUsd)}
									<span className="text-neutral-500 dark:text-neutral-500">
										{" "}
										· {formatPercent(row.costShare)}
									</span>
								</span>
							</div>
							<div
								className="mt-1 h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden"
								title={`${row.key}: ${formatUsd(row.costUsd)} · ${formatCompact(row.totalTokens)} tokens · ${formatCompact(row.queryCount)} calls`}
							>
								<div
									className="h-full rounded-full bg-[var(--color-primary)]"
									style={{
										width: max > 0 ? `${(row.costUsd / max) * 100}%` : "0%",
									}}
								/>
							</div>
							<div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
								{formatCompact(row.totalTokens)} tokens ·{" "}
								{formatCompact(row.queryCount)} calls
								{row.unpricedEvents > 0
									? ` · ${formatCompact(row.unpricedEvents)} unpriced`
									: ""}
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

const ALERT_STYLES: Record<TelemetryAlert["severity"], string> = {
	critical:
		"border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-200",
	warning:
		"border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-200",
	info: "border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-300",
};

function AlertList() {
	const { alerts, loading, error } = useTelemetryAlerts();

	if (loading) {
		return (
			<div className="text-sm text-neutral-500 dark:text-neutral-400">
				Loading alerts…
			</div>
		);
	}
	if (error) {
		return (
			<div className="text-sm text-red-600 dark:text-red-400">
				Error loading alerts: {error.message}
			</div>
		);
	}
	if (!alerts || alerts.alerts.length === 0) {
		return (
			<div className="text-sm text-neutral-500 dark:text-neutral-400">
				No cost anomalies in the last hour (thresholds:{" "}
				{formatUsd(alerts?.thresholds.userHourlySpendUsd ?? 0)} per user,{" "}
				{formatUsd(alerts?.thresholds.orgHourlySpendUsd ?? 0)} org-wide).
			</div>
		);
	}

	return (
		<ul className="space-y-2">
			{alerts.alerts.map((alert) => (
				<li
					key={alert.id}
					className={`rounded-md border px-3 py-2 text-sm ${ALERT_STYLES[alert.severity]}`}
				>
					{/* Severity is spelled out, never colour alone. */}
					<div className="font-medium">
						[{alert.severity.toUpperCase()}] {alert.title}
					</div>
					<div className="text-xs mt-0.5">{alert.detail}</div>
				</li>
			))}
		</ul>
	);
}

export function CostAttributionPanel({
	fromDate,
	toDate,
}: {
	fromDate: string;
	toDate: string;
}) {
	const { attribution, loading, error } = useCostAttribution(fromDate, toDate);

	if (loading) {
		return (
			<div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-4 md:p-6 flex-shrink-0">
				<h2 className="text-lg md:text-xl font-semibold mb-2">
					Cost attribution
				</h2>
				<div className="text-sm text-neutral-500">Loading cost data…</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-4 md:p-6 flex-shrink-0">
				<h2 className="text-lg md:text-xl font-semibold mb-2">
					Cost attribution
				</h2>
				<div className="text-sm text-red-600 dark:text-red-400">
					Error loading cost attribution: {error.message}
				</div>
			</div>
		);
	}

	if (!attribution) return null;

	const { totals } = attribution;
	const interactive = attribution.bySurface.find(
		(row) => row.key === "interactive"
	);
	const interactiveShare = interactive?.costShare ?? 0;
	const costPerUser =
		totals.distinctUsers > 0 ? totals.costUsd / totals.distinctUsers : 0;
	const unpricedShare =
		totals.eventCount > 0 ? totals.unpricedEvents / totals.eventCount : 0;

	return (
		<div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-4 md:p-6 flex-shrink-0 space-y-6">
			<div>
				<h2 className="text-lg md:text-xl font-semibold">Cost attribution</h2>
				<p className="text-sm text-neutral-600 dark:text-neutral-400">
					Which features are spending the money, priced from{" "}
					<code className="text-xs">src/config/model-pricing.ts</code>.
				</p>
			</div>

			{totals.eventCount === 0 ? (
				<div className="text-sm text-neutral-500 dark:text-neutral-400">
					No attributed LLM spend recorded in this window. Attribution starts
					accumulating once migration 0030 has been applied and LLM calls run.
				</div>
			) : (
				<>
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
						<StatTile
							label="Total spend"
							value={formatUsd(totals.costUsd)}
							hint={`${formatCompact(totals.queryCount)} calls · ${formatCompact(totals.totalTokens)} tokens`}
						/>
						<StatTile
							label="Cost per active user"
							value={formatUsd(costPerUser)}
							hint={`${totals.distinctUsers} users with spend`}
						/>
						<StatTile
							label="Interactive share"
							value={formatPercent(interactiveShare)}
							hint="user-blocking vs background pipeline"
						/>
						<StatTile
							label="Cache hit rate"
							value={formatPercent(totals.cacheHitRate)}
							hint={`${formatCompact(totals.cachedInputTokens)} of ${formatCompact(totals.cachedInputTokens + totals.promptTokens)} input tokens cached`}
						/>
					</div>

					{unpricedShare > 0 ? (
						<p className="text-xs text-amber-700 dark:text-amber-400">
							{formatPercent(unpricedShare)} of calls could not be priced (no
							rate-card entry, or the provider did not report an input/output
							split). Dollar figures above understate actual spend.
						</p>
					) : null}

					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<SpendBars
							title="Spend by agent"
							description="Which of the agents dominates."
							rows={attribution.byAgent}
							emptyLabel="No agent-attributed spend in this range"
						/>
						<SpendBars
							title="Spend by intent"
							description="Tagged spend intents from the token-spend log."
							rows={attribution.byIntent}
							emptyLabel="No intent-attributed spend in this range"
						/>
						<SpendBars
							title="Spend by model role"
							description="Verifies cheap-tier routing actually holds in practice."
							rows={attribution.byModelRole}
							emptyLabel="No model-role-attributed spend in this range"
						/>
						<SpendBars
							title="Spend by model"
							description="Actual models billed in this window."
							rows={attribution.byModel}
							emptyLabel="No model-attributed spend in this range"
						/>
						<SpendBars
							title="Interactive vs pipeline"
							description="User-blocking spend against background indexing."
							rows={attribution.bySurface}
							emptyLabel="No spend in this range"
						/>
						<SpendBars
							title="Spend by tier"
							description="Total spend attributed to each subscription tier."
							rows={attribution.byTier}
							emptyLabel="No tier-attributed spend in this range"
						/>
					</div>

					<div>
						<h3 className="text-base font-medium">Cost to serve, per tier</h3>
						<p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
							Whether Basic and Pro are priced above what they cost to run.
						</p>
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="text-left text-neutral-600 dark:text-neutral-400">
										<th className="py-1 pr-4 font-medium">Tier</th>
										<th className="py-1 pr-4 font-medium text-right">Users</th>
										<th className="py-1 pr-4 font-medium text-right">
											Total spend
										</th>
										<th className="py-1 pr-4 font-medium text-right">
											Per user
										</th>
										<th className="py-1 font-medium text-right">Tokens</th>
									</tr>
								</thead>
								<tbody>
									{attribution.costPerTier.map((row) => (
										<tr
											key={row.tier}
											className="border-t border-neutral-200 dark:border-neutral-700"
										>
											<td className="py-1 pr-4">{row.tier}</td>
											<td className="py-1 pr-4 text-right tabular-nums">
												{row.userCount}
											</td>
											<td className="py-1 pr-4 text-right tabular-nums">
												{formatUsd(row.costUsd)}
											</td>
											<td className="py-1 pr-4 text-right tabular-nums font-medium">
												{formatUsd(row.costPerUserUsd)}
											</td>
											<td className="py-1 text-right tabular-nums">
												{formatCompact(row.totalTokens)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>

					<div>
						<h3 className="text-base font-medium mb-2">Top spenders</h3>
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="text-left text-neutral-600 dark:text-neutral-400">
										<th className="py-1 pr-4 font-medium">User</th>
										<th className="py-1 pr-4 font-medium">Tier</th>
										<th className="py-1 pr-4 font-medium text-right">Spend</th>
										<th className="py-1 pr-4 font-medium text-right">Tokens</th>
										<th className="py-1 font-medium text-right">Calls</th>
									</tr>
								</thead>
								<tbody>
									{attribution.topSpenders.map((row) => (
										<tr
											key={row.username}
											className="border-t border-neutral-200 dark:border-neutral-700"
										>
											<td className="py-1 pr-4 truncate max-w-[16rem]">
												{row.username}
											</td>
											<td className="py-1 pr-4">{row.tier}</td>
											<td className="py-1 pr-4 text-right tabular-nums">
												{formatUsd(row.costUsd)}
											</td>
											<td className="py-1 pr-4 text-right tabular-nums">
												{formatCompact(row.totalTokens)}
											</td>
											<td className="py-1 text-right tabular-nums">
												{formatCompact(row.eventCount)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</>
			)}

			<div>
				<h3 className="text-base font-medium mb-2">Cost anomaly alerts</h3>
				<AlertList />
			</div>
		</div>
	);
}
