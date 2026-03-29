import { useCallback, useState } from "react";
import { API_CONFIG } from "@/app-constants";
import {
	useAdminTelemetryOverview,
	useTelemetryDashboard,
} from "@/hooks/useTelemetryMetrics";
import { ENDPOINTS } from "@/routes/endpoints";
import { AuthService } from "@/services/core/auth-service";
import type { StuckJobSample } from "@/types/admin-analytics";
import type { AggregatedMetrics } from "@/types/telemetry";

function AggregatedMsCard({
	title,
	m,
	unit = "ms",
}: {
	title: string;
	m: AggregatedMetrics | null;
	unit?: "ms" | "score" | "count";
}) {
	if (!m || m.count === 0) {
		return (
			<div className="text-sm text-neutral-500 dark:text-neutral-400">
				No {title.toLowerCase()} data in this range
			</div>
		);
	}
	const fmt = (v: number) =>
		unit === "score" ? v.toFixed(2) : Math.round(v).toString();
	const suffix = unit === "ms" ? "ms" : unit === "score" ? "" : "";
	return (
		<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
			<div>
				<div className="text-sm text-neutral-600 dark:text-neutral-400">
					P50
				</div>
				<div className="text-2xl font-bold">
					{fmt(m.p50)}
					{suffix}
				</div>
			</div>
			<div>
				<div className="text-sm text-neutral-600 dark:text-neutral-400">
					P95
				</div>
				<div className="text-2xl font-bold">
					{fmt(m.p95)}
					{suffix}
				</div>
			</div>
			<div>
				<div className="text-sm text-neutral-600 dark:text-neutral-400">
					P99
				</div>
				<div className="text-2xl font-bold">
					{fmt(m.p99)}
					{suffix}
				</div>
			</div>
			<div>
				<div className="text-sm text-neutral-600 dark:text-neutral-400">
					Average
				</div>
				<div className="text-2xl font-bold">
					{fmt(m.avg)}
					{suffix}
				</div>
			</div>
		</div>
	);
}

function CountRow(props: { label: string; value: number | string }) {
	return (
		<div className="flex justify-between gap-4 text-sm">
			<span className="text-neutral-600 dark:text-neutral-400">
				{props.label}
			</span>
			<span className="font-medium tabular-nums">{props.value}</span>
		</div>
	);
}

type DuplicateNameGroup = {
	normalizedName: string;
	entities: Array<{
		id: string;
		name: string;
		entityType: string;
	}>;
};

export function TelemetryDashboard() {
	const [[fromDate, toDate], setWindow] = useState(() => {
		const t = Date.now();
		return [
			new Date(t - 7 * 86400000).toISOString(),
			new Date(t).toISOString(),
		] as const;
	});

	const [dupCampaignId, setDupCampaignId] = useState("");
	const [dupGroups, setDupGroups] = useState<DuplicateNameGroup[] | null>(null);
	const [dupLoading, setDupLoading] = useState(false);
	const [dupError, setDupError] = useState<string | null>(null);

	const loadDuplicateNameCandidates = useCallback(async () => {
		const id = dupCampaignId.trim();
		if (!id) {
			setDupError("Enter a campaign id");
			return;
		}
		setDupLoading(true);
		setDupError(null);
		try {
			const jwt = AuthService.getStoredJwt();
			if (!jwt) {
				throw new Error("Authentication required");
			}
			const url = API_CONFIG.buildUrl(
				ENDPOINTS.CAMPAIGNS.ENTITIES.DUPLICATE_NAME_CANDIDATES(id)
			);
			const res = await fetch(`${url}?maxGroups=40`, {
				headers: { Authorization: `Bearer ${jwt}` },
			});
			if (!res.ok) {
				const err = (await res.json().catch(() => ({}))) as {
					error?: string;
				};
				throw new Error(err.error ?? `Request failed (${res.status})`);
			}
			const data = (await res.json()) as { groups: DuplicateNameGroup[] };
			setDupGroups(data.groups ?? []);
		} catch (e) {
			setDupGroups(null);
			setDupError(e instanceof Error ? e.message : "Request failed");
		} finally {
			setDupLoading(false);
		}
	}, [dupCampaignId]);

	const applyPreset = useCallback((days: number) => {
		const t = Date.now();
		setWindow([
			new Date(t - days * 86400000).toISOString(),
			new Date(t).toISOString(),
		]);
	}, []);

	const refreshSameSpan = useCallback(() => {
		const span = Math.max(
			0,
			new Date(toDate).getTime() - new Date(fromDate).getTime()
		);
		const t = Date.now();
		setWindow([new Date(t - span).toISOString(), new Date(t).toISOString()]);
	}, [fromDate, toDate]);

	const { overview, loading, error } = useAdminTelemetryOverview(
		fromDate,
		toDate
	);
	const { dashboard } = useTelemetryDashboard();

	if (loading) {
		return (
			<div className="p-4 md:p-8 min-w-0 overflow-x-hidden">
				<div className="text-lg font-semibold mb-4">Telemetry dashboard</div>
				<div>Loading metrics...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-4 md:p-8 min-w-0 overflow-x-hidden">
				<div className="text-lg font-semibold mb-4">Telemetry dashboard</div>
				<div className="text-red-600 dark:text-red-400">
					Error loading dashboard: {error.message}
				</div>
			</div>
		);
	}

	if (!overview) {
		return (
			<div className="p-4 md:p-8 min-w-0 overflow-x-hidden">
				<div className="text-lg font-semibold mb-4">Telemetry dashboard</div>
				<div className="text-neutral-500">No data</div>
			</div>
		);
	}

	const t = overview.telemetry;
	const ar = overview.shards.approveRejectInWindow;

	return (
		<div className="p-4 md:p-8 space-y-6 min-w-0 overflow-x-hidden h-full flex flex-col overflow-y-auto">
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 flex-shrink-0">
				<div className="text-xl md:text-2xl font-bold">
					GraphRAG telemetry dashboard
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm text-neutral-600 dark:text-neutral-400">
						Range
					</span>
					<button
						type="button"
						className="px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800"
						onClick={() => applyPreset(1)}
					>
						Last 24 hours
					</button>
					<button
						type="button"
						className="px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800"
						onClick={() => applyPreset(7)}
					>
						Last 7 days
					</button>
					<button
						type="button"
						className="px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800"
						onClick={() => applyPreset(30)}
					>
						Last 30 days
					</button>
					<button
						type="button"
						className="px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800"
						onClick={refreshSameSpan}
					>
						Refresh
					</button>
				</div>
			</div>

			<p className="text-sm text-neutral-600 dark:text-neutral-400 flex-shrink-0">
				Window: {new Date(overview.window.from).toLocaleString()} –{" "}
				{new Date(overview.window.to).toLocaleString()} · Last updated:{" "}
				{new Date(overview.lastUpdated).toLocaleString()}
			</p>

			{/* Processing + GraphRAG telemetry */}
			<div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-4 md:p-6 flex-shrink-0 space-y-6">
				<h2 className="text-lg md:text-xl font-semibold">
					Processing and GraphRAG
				</h2>
				<div>
					<h3 className="text-base font-medium mb-2">
						File processing duration
					</h3>
					<AggregatedMsCard
						title="file processing"
						m={t.fileProcessingDurationMs}
					/>
				</div>
				<div>
					<h3 className="text-base font-medium mb-2">Query latency</h3>
					<AggregatedMsCard title="query latency" m={t.queryLatency} />
				</div>
				<div>
					<h3 className="text-base font-medium mb-2">
						Rebuild duration (telemetry)
					</h3>
					<AggregatedMsCard title="rebuild duration" m={t.rebuildDuration} />
				</div>
				<div>
					<h3 className="text-base font-medium mb-2">DM satisfaction</h3>
					{t.dmSatisfaction && t.dmSatisfaction.count > 0 ? (
						<AggregatedMsCard
							title="DM satisfaction"
							m={t.dmSatisfaction}
							unit="score"
						/>
					) : (
						<div className="text-sm text-neutral-500">
							No satisfaction data in this range
						</div>
					)}
				</div>
				<div>
					<h3 className="text-base font-medium mb-2">Context accuracy</h3>
					{t.contextAccuracy && t.contextAccuracy.count > 0 ? (
						<AggregatedMsCard
							title="context accuracy"
							m={t.contextAccuracy}
							unit="score"
						/>
					) : (
						<div className="text-sm text-neutral-500">
							No accuracy data in this range
						</div>
					)}
				</div>
				<div>
					<h3 className="text-base font-medium mb-2">
						Changelog entries (telemetry)
					</h3>
					{t.changelogEntryCount && t.changelogEntryCount.count > 0 ? (
						<AggregatedMsCard
							title="changelog entries"
							m={t.changelogEntryCount}
							unit="count"
						/>
					) : (
						<div className="text-sm text-neutral-500">
							No changelog telemetry in this range
						</div>
					)}
				</div>
			</div>

			{/* Shards */}
			<div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-4 md:p-6 flex-shrink-0">
				<h2 className="text-lg md:text-xl font-semibold mb-4">
					Shards (entities)
				</h2>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
					<CountRow
						label="Created in window"
						value={overview.shards.createdInWindow}
					/>
					<CountRow
						label="Approval rate (updates in window)"
						value={
							ar.approvalRate != null
								? `${(ar.approvalRate * 100).toFixed(1)}%`
								: "—"
						}
					/>
					<CountRow label="Approved (updates in window)" value={ar.approved} />
					<CountRow label="Rejected (updates in window)" value={ar.rejected} />
				</div>
				<div className="text-sm font-medium mb-2">
					By status (created in window)
				</div>
				<div className="flex flex-wrap gap-2">
					{Object.entries(overview.shards.byStatusCreatedInWindow).map(
						([k, v]) => (
							<span
								key={k}
								className="inline-flex items-center gap-1 px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-900 text-sm"
							>
								{k}: <strong>{v}</strong>
							</span>
						)
					)}
				</div>
				{overview.shards.topEntityTypesCreated.length > 0 && (
					<div className="mt-4">
						<div className="text-sm font-medium mb-2">
							Top entity types (created)
						</div>
						<ul className="text-sm space-y-1">
							{overview.shards.topEntityTypesCreated.map((row) => (
								<li key={row.entityType} className="flex justify-between gap-4">
									<span>{row.entityType}</span>
									<span className="tabular-nums">{row.count}</span>
								</li>
							))}
						</ul>
					</div>
				)}
			</div>

			{/* Stuck jobs */}
			<div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-4 md:p-6 flex-shrink-0">
				<h2 className="text-lg md:text-xl font-semibold mb-2">Stuck jobs</h2>
				<p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
					Thresholds (minutes): extraction{" "}
					{overview.stuckThresholds.entityExtractionMinutes}, sync{" "}
					{overview.stuckThresholds.syncQueueMinutes}, rebuild{" "}
					{overview.stuckThresholds.rebuildMinutes}, chunks{" "}
					{overview.stuckThresholds.fileChunkMinutes}
				</p>
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
					<CountRow
						label="Entity extraction"
						value={overview.queues.stuck.entityExtraction.count}
					/>
					<CountRow
						label="Sync queue"
						value={overview.queues.stuck.syncQueue.count}
					/>
					<CountRow
						label="Graph rebuild"
						value={overview.queues.stuck.rebuild.count}
					/>
					<CountRow
						label="File chunks"
						value={overview.queues.stuck.fileChunks.count}
					/>
				</div>
				<StuckTable
					title="Entity extraction samples"
					samples={overview.queues.stuck.entityExtraction.samples}
				/>
				<StuckTable
					title="Sync queue samples"
					samples={overview.queues.stuck.syncQueue.samples}
				/>
				<StuckTable
					title="Rebuild samples"
					samples={overview.queues.stuck.rebuild.samples}
				/>
				<StuckTable
					title="File chunk samples"
					samples={overview.queues.stuck.fileChunks.samples}
				/>
			</div>

			{/* Rebuild health */}
			<div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-4 md:p-6 flex-shrink-0">
				<h2 className="text-lg md:text-xl font-semibold mb-4">
					Graph rebuild health
				</h2>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
					{Object.entries(overview.rebuilds.countsByStatusInWindow).map(
						([k, v]) => (
							<CountRow key={k} label={k} value={v} />
						)
					)}
				</div>
				{overview.rebuilds.completedDurationMs.count > 0 && (
					<div className="text-sm space-y-1">
						<CountRow
							label="Completed rebuilds (duration in metadata)"
							value={overview.rebuilds.completedDurationMs.count}
						/>
						<CountRow
							label="Avg duration (ms)"
							value={
								overview.rebuilds.completedDurationMs.avg != null
									? Math.round(overview.rebuilds.completedDurationMs.avg)
									: "—"
							}
						/>
						<CountRow
							label="Median duration (ms)"
							value={
								overview.rebuilds.completedDurationMs.median != null
									? Math.round(overview.rebuilds.completedDurationMs.median)
									: "—"
							}
						/>
					</div>
				)}
			</div>

			{/* Most common errors */}
			{dashboard && (dashboard.topErrors ?? []).length > 0 && (
				<div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-4 md:p-6 flex-shrink-0">
					<h2 className="text-lg md:text-xl font-semibold mb-4">
						Most common errors (last 7 days)
					</h2>
					<p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
						Grouped by identical message text from failed graph rebuilds and
						failed entity extraction jobs.
					</p>
					<ol className="list-decimal list-inside space-y-3 text-sm">
						{(dashboard.topErrors ?? []).map((row) => (
							<li
								key={`${row.source}-${row.count}-${row.message.slice(0, 120)}`}
							>
								<span className="font-medium text-neutral-800 dark:text-neutral-200">
									{row.count}×{" "}
								</span>
								<span className="text-neutral-500 dark:text-neutral-400 text-xs uppercase tracking-wide">
									{row.source === "graph_rebuild"
										? "Graph rebuild"
										: "Entity extraction"}
								</span>
								<div className="mt-1 pl-0 sm:pl-5 text-neutral-700 dark:text-neutral-300 break-words whitespace-pre-wrap font-mono text-xs">
									{row.message}
								</div>
							</li>
						))}
					</ol>
				</div>
			)}

			{/* Dashboard summary */}
			{dashboard && (
				<div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-4 md:p-6 flex-shrink-0">
					<h2 className="text-lg md:text-xl font-semibold mb-4">
						Dashboard summary
					</h2>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						{dashboard.summary.queryLatency && (
							<div>
								<div className="text-sm text-neutral-600 dark:text-neutral-400">
									Query latency (P95)
								</div>
								<div className="text-xl font-bold">
									{Math.round(dashboard.summary.queryLatency.p95)}ms
								</div>
							</div>
						)}
						{dashboard.summary.rebuildDuration && (
							<div>
								<div className="text-sm text-neutral-600 dark:text-neutral-400">
									Rebuild duration (avg)
								</div>
								<div className="text-xl font-bold">
									{Math.round(dashboard.summary.rebuildDuration.avg)}ms
								</div>
							</div>
						)}
						{dashboard.summary.dmSatisfaction && (
							<div>
								<div className="text-sm text-neutral-600 dark:text-neutral-400">
									DM satisfaction (avg)
								</div>
								<div className="text-xl font-bold">
									{dashboard.summary.dmSatisfaction.avg.toFixed(2)} / 5.0
								</div>
							</div>
						)}
						{dashboard.summary.changelogGrowth.length > 0 && (
							<div>
								<div className="text-sm text-neutral-600 dark:text-neutral-400">
									Changelog entries (last 7 days)
								</div>
								<div className="text-xl font-bold">
									{dashboard.summary.changelogGrowth.reduce(
										(sum, point) => sum + point.count,
										0
									)}
								</div>
							</div>
						)}
						{dashboard.summary.extractionJsonRepair &&
							dashboard.summary.extractionJsonRepair.count > 0 && (
								<div>
									<div className="text-sm text-neutral-600 dark:text-neutral-400">
										JSON repair passes (avg per completed extraction job)
									</div>
									<div className="text-xl font-bold">
										{dashboard.summary.extractionJsonRepair.avg.toFixed(2)}
									</div>
								</div>
							)}
						{dashboard.summary.shardApprovalNew &&
							dashboard.summary.shardApprovalNew.count > 0 && (
								<div>
									<div className="text-sm text-neutral-600 dark:text-neutral-400">
										New shard approvals (last 7 days)
									</div>
									<div className="text-xl font-bold">
										{Math.round(dashboard.summary.shardApprovalNew.sum ?? 0)}
									</div>
								</div>
							)}
						{dashboard.summary.shardApprovalUpdate &&
							dashboard.summary.shardApprovalUpdate.count > 0 && (
								<div>
									<div className="text-sm text-neutral-600 dark:text-neutral-400">
										Updated shard approvals (last 7 days)
									</div>
									<div className="text-xl font-bold">
										{Math.round(dashboard.summary.shardApprovalUpdate.sum ?? 0)}
									</div>
								</div>
							)}
						{dashboard.summary.extractionChunkGateSkip &&
							dashboard.summary.extractionChunkGateSkip.count > 0 && (
								<div>
									<div className="text-sm text-neutral-600 dark:text-neutral-400">
										Chunk gate: skipped full extraction (last 7 days)
									</div>
									<div className="text-xl font-bold">
										{Math.round(
											dashboard.summary.extractionChunkGateSkip.sum ?? 0
										)}
									</div>
								</div>
							)}
						{dashboard.summary.extractionChunkGateRun &&
							dashboard.summary.extractionChunkGateRun.count > 0 && (
								<div>
									<div className="text-sm text-neutral-600 dark:text-neutral-400">
										Chunk gate: ran full extraction (last 7 days)
									</div>
									<div className="text-xl font-bold">
										{Math.round(
											dashboard.summary.extractionChunkGateRun.sum ?? 0
										)}
									</div>
								</div>
							)}
						{(() => {
							const skipSum =
								dashboard.summary.extractionChunkGateSkip?.sum ?? 0;
							const runSum = dashboard.summary.extractionChunkGateRun?.sum ?? 0;
							const denom = skipSum + runSum;
							if (denom <= 0) return null;
							return (
								<div>
									<div className="text-sm text-neutral-600 dark:text-neutral-400">
										Chunk gate: skip rate (last 7 days)
									</div>
									<div className="text-xl font-bold">
										{((skipSum / denom) * 100).toFixed(1)}%
									</div>
								</div>
							);
						})()}
						{dashboard.summary.extractionChunkGateLatency &&
							dashboard.summary.extractionChunkGateLatency.count > 0 && (
								<div>
									<div className="text-sm text-neutral-600 dark:text-neutral-400">
										Chunk gate: cheap model latency (P95, last 7 days)
									</div>
									<div className="text-xl font-bold">
										{`${Math.round(dashboard.summary.extractionChunkGateLatency.p95)}ms`}
									</div>
								</div>
							)}
					</div>
				</div>
			)}

			{/* Digests */}
			<div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-4 md:p-6 flex-shrink-0">
				<h2 className="text-lg md:text-xl font-semibold mb-4">
					Session digest funnel (updates in window)
				</h2>
				<div className="flex flex-wrap gap-2">
					{Object.entries(overview.digests.countsByStatusInWindow).map(
						([k, v]) => (
							<span
								key={k}
								className="inline-flex items-center gap-1 px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-900 text-sm"
							>
								{k}: <strong>{v}</strong>
							</span>
						)
					)}
				</div>
			</div>

			{/* Dedup */}
			<div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-4 md:p-6 flex-shrink-0">
				<h2 className="text-lg md:text-xl font-semibold mb-4">
					Semantic deduplication
				</h2>
				<div className="space-y-1 text-sm">
					<CountRow
						label="Pending decisions"
						value={overview.dedup.pendingCount}
					/>
					<CountRow
						label="Oldest pending age (hours)"
						value={overview.dedup.oldestPendingAgeHours ?? "—"}
					/>
					<CountRow
						label="Resolved in window"
						value={overview.dedup.resolvedInWindow}
					/>
				</div>
				<div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-700">
					<h3 className="text-base font-medium mb-2">
						Duplicate name candidates (by campaign)
					</h3>
					<p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
						Rows that share the same normalized name—use for manual merge
						review.
					</p>
					<div className="flex flex-wrap gap-2 items-center mb-3">
						<label className="sr-only" htmlFor="dup-campaign-id">
							Campaign id
						</label>
						<input
							id="dup-campaign-id"
							type="text"
							placeholder="Campaign id"
							value={dupCampaignId}
							onChange={(e) => setDupCampaignId(e.target.value)}
							className="flex-1 min-w-[12rem] px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900"
						/>
						<button
							type="button"
							onClick={() => void loadDuplicateNameCandidates()}
							disabled={dupLoading}
							className="px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
						>
							{dupLoading ? "Loading…" : "Load groups"}
						</button>
					</div>
					{dupError && (
						<div className="text-sm text-red-600 dark:text-red-400 mb-2">
							{dupError}
						</div>
					)}
					{dupGroups && dupGroups.length === 0 && !dupLoading && (
						<div className="text-sm text-neutral-500">
							No same-name groups in this campaign.
						</div>
					)}
					{dupGroups && dupGroups.length > 0 && (
						<ul className="space-y-3 text-sm max-h-64 overflow-y-auto">
							{dupGroups.map((g) => (
								<li
									key={g.normalizedName}
									className="rounded border border-neutral-200 dark:border-neutral-700 p-2 bg-neutral-50 dark:bg-neutral-900/50"
								>
									<div className="font-medium mb-1">{g.normalizedName}</div>
									<ul className="space-y-1 text-neutral-600 dark:text-neutral-400">
										{g.entities.map((e) => (
											<li key={e.id} className="font-mono text-xs break-all">
												{e.id}{" "}
												<span className="text-neutral-500">
													({e.entityType})
												</span>
											</li>
										))}
									</ul>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>

			{/* Growth */}
			<div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-4 md:p-6 flex-shrink-0">
				<h2 className="text-lg md:text-xl font-semibold mb-4">Growth</h2>
				<div className="space-y-1 text-sm">
					<CountRow
						label="Campaigns created"
						value={overview.growth.campaignsCreatedInWindow}
					/>
					<CountRow
						label="Resources created"
						value={overview.growth.resourcesCreatedInWindow}
					/>
				</div>
			</div>

			{/* Library */}
			<div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-4 md:p-6 flex-shrink-0">
				<h2 className="text-lg md:text-xl font-semibold mb-4">
					Library file health
				</h2>
				<div className="text-sm font-medium mb-2">By status</div>
				<div className="flex flex-wrap gap-2 mb-4">
					{Object.entries(overview.library.statusDistribution).map(([k, v]) => (
						<span
							key={k}
							className="inline-flex items-center gap-1 px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-900 text-sm"
						>
							{k || "unknown"}: <strong>{v}</strong>
						</span>
					))}
				</div>
				<div className="space-y-1 text-sm mb-4">
					<CountRow
						label="With processing error"
						value={overview.library.withProcessingError}
					/>
					<CountRow
						label="Memory limit exceeded"
						value={overview.library.memoryLimitExceeded}
					/>
				</div>
				<div className="text-sm font-medium mb-2">Analysis status</div>
				<div className="flex flex-wrap gap-2">
					{Object.entries(overview.library.analysisStatusDistribution).map(
						([k, v]) => (
							<span
								key={k}
								className="inline-flex items-center gap-1 px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-900 text-sm"
							>
								{k || "unknown"}: <strong>{v}</strong>
							</span>
						)
					)}
				</div>
			</div>

			{/* Usage */}
			<div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-4 md:p-6 flex-shrink-0">
				<h2 className="text-lg md:text-xl font-semibold mb-4">Usage</h2>
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<div>
						<h3 className="text-sm font-medium mb-2">Messages (window)</h3>
						<ul className="text-sm space-y-1">
							{overview.usage.topByMessages.length === 0 ? (
								<li className="text-neutral-500">No data</li>
							) : (
								overview.usage.topByMessages.map((r) => (
									<li key={r.username} className="flex justify-between gap-2">
										<span className="truncate">{r.username}</span>
										<span className="tabular-nums">{r.messageCount}</span>
									</li>
								))
							)}
						</ul>
					</div>
					<div>
						<h3 className="text-sm font-medium mb-2">
							Monthly tokens (month of range end)
						</h3>
						<ul className="text-sm space-y-1">
							{overview.usage.topByMonthlyTokens.length === 0 ? (
								<li className="text-neutral-500">No data</li>
							) : (
								overview.usage.topByMonthlyTokens.map((r) => (
									<li key={r.username} className="flex justify-between gap-2">
										<span className="truncate">{r.username}</span>
										<span className="tabular-nums">{r.tokens}</span>
									</li>
								))
							)}
						</ul>
					</div>
					<div>
						<h3 className="text-sm font-medium mb-2">
							Lifetime free tier usage
						</h3>
						<ul className="text-sm space-y-1">
							{overview.usage.topByLifetimeFreeTier.length === 0 ? (
								<li className="text-neutral-500">No data</li>
							) : (
								overview.usage.topByLifetimeFreeTier.map((r) => (
									<li key={r.username} className="flex justify-between gap-2">
										<span className="truncate">{r.username}</span>
										<span className="tabular-nums">{r.tokensUsed}</span>
									</li>
								))
							)}
						</ul>
					</div>
				</div>
			</div>

			<p className="text-sm text-neutral-500 flex-shrink-0">
				Note: This dashboard requires admin access. Operational metrics come
				from D1; latency and quality rows use graphrag_telemetry.
			</p>
		</div>
	);
}

function StuckTable({
	title,
	samples,
}: {
	title: string;
	samples: StuckJobSample[];
}) {
	if (samples.length === 0) return null;
	return (
		<div className="mb-4 overflow-x-auto">
			<div className="text-sm font-medium mb-2">{title}</div>
			<table className="w-full text-sm border-collapse">
				<thead>
					<tr className="border-b border-neutral-200 dark:border-neutral-600 text-left">
						<th className="py-1 pr-2">Kind</th>
						<th className="py-1 pr-2">Id</th>
						<th className="py-1 pr-2">Age (min)</th>
						<th className="py-1 pr-2">Status</th>
						<th className="py-1 pr-2">Detail</th>
					</tr>
				</thead>
				<tbody>
					{samples.map((s) => (
						<tr
							key={`${s.kind}-${s.id}`}
							className="border-b border-neutral-100 dark:border-neutral-700/80"
						>
							<td className="py-1 pr-2">{s.kind}</td>
							<td className="py-1 pr-2 font-mono text-xs">{s.id}</td>
							<td className="py-1 pr-2 tabular-nums">{s.ageMinutes}</td>
							<td className="py-1 pr-2">{s.status ?? "—"}</td>
							<td className="py-1 pr-2 max-w-[200px] truncate">
								{s.campaignId ?? s.username ?? s.detail ?? "—"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
