import type {
	DedupAnalytics,
	DigestFunnelAnalytics,
	GrowthAnalytics,
	LibraryHealthAnalytics,
	RebuildHealthAnalytics,
	ShardAnalytics,
	StuckJobSample,
	StuckQueuesAnalytics,
	UsageAnalytics,
	UsageLeaderRow,
} from "@/types/admin-analytics";
import { BaseDAOClass } from "./base-dao";

export interface AdminAnalyticsQueryOptions {
	fromDate: string;
	toDate: string;
	topN: number;
	sampleLimit: number;
	entityExtractionStuckBefore: string;
	syncQueueStuckBefore: string;
	rebuildStuckBefore: string;
	fileChunkStuckBefore: string;
	entityExtractionStuckMinutes: number;
	syncQueueStuckMinutes: number;
	rebuildStuckMinutes: number;
	fileChunkStuckMinutes: number;
}

function median(nums: number[]): number | null {
	if (nums.length === 0) return null;
	const s = [...nums].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

export class AdminAnalyticsDAO extends BaseDAOClass {
	async getShardAnalytics(
		fromDate: string,
		toDate: string,
		topN: number
	): Promise<ShardAnalytics> {
		const createdRows = await this.queryAll<{
			shard_status: string;
			c: number;
		}>(
			`SELECT COALESCE(shard_status, 'unknown') AS shard_status, COUNT(*) AS c FROM entities
       WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)
       GROUP BY COALESCE(shard_status, 'unknown')`,
			[fromDate, toDate]
		);
		const byStatusCreatedInWindow: Record<string, number> = {};
		let createdInWindow = 0;
		for (const r of createdRows) {
			byStatusCreatedInWindow[r.shard_status || "unknown"] = r.c;
			createdInWindow += r.c;
		}

		const ar = await this.queryFirst<{ approved: number; rejected: number }>(
			`SELECT
         COALESCE(SUM(CASE WHEN shard_status = 'approved' THEN 1 ELSE 0 END), 0) AS approved,
         COALESCE(SUM(CASE WHEN shard_status = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected
       FROM entities
       WHERE shard_status IN ('approved', 'rejected')
         AND datetime(updated_at) >= datetime(?) AND datetime(updated_at) <= datetime(?)`,
			[fromDate, toDate]
		);
		const approved = ar?.approved ?? 0;
		const rejected = ar?.rejected ?? 0;
		const total = approved + rejected;
		const approvalRate = total > 0 ? approved / total : null;

		const typeRows = await this.queryAll<{ entity_type: string; c: number }>(
			`SELECT entity_type, COUNT(*) AS c FROM entities
       WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)
       GROUP BY entity_type ORDER BY c DESC LIMIT ?`,
			[fromDate, toDate, topN]
		);
		const topEntityTypesCreated = typeRows.map((r) => ({
			entityType: r.entity_type,
			count: r.c,
		}));

		return {
			createdInWindow,
			byStatusCreatedInWindow,
			approveRejectInWindow: {
				approved,
				rejected,
				approvalRate,
			},
			topEntityTypesCreated,
		};
	}

	async getStuckQueues(
		opts: AdminAnalyticsQueryOptions
	): Promise<StuckQueuesAnalytics> {
		const lim = opts.sampleLimit;
		const nowMs = Date.now();

		const stuckBefore = opts.entityExtractionStuckBefore;
		const entitySamples = await this.queryAll<{
			id: number;
			campaign_id: string;
			username: string;
			resource_name: string;
			status: string;
			created_at: string;
			updated_at: string;
		}>(
			`SELECT id, campaign_id, username, resource_name, status, created_at, updated_at
       FROM entity_extraction_queue
       WHERE (
         (status = 'pending' AND datetime(created_at) < datetime(?))
         OR (status = 'processing' AND datetime(updated_at) < datetime(?))
         OR (status = 'rate_limited' AND datetime(created_at) < datetime(?))
       )
       ORDER BY
         CASE status WHEN 'processing' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
         created_at ASC
       LIMIT ?`,
			[stuckBefore, stuckBefore, stuckBefore, lim]
		);
		const entityCountRow = await this.queryFirst<{ c: number }>(
			`SELECT COUNT(*) AS c FROM entity_extraction_queue
       WHERE (
         (status = 'pending' AND datetime(created_at) < datetime(?))
         OR (status = 'processing' AND datetime(updated_at) < datetime(?))
         OR (status = 'rate_limited' AND datetime(created_at) < datetime(?))
       )`,
			[stuckBefore, stuckBefore, stuckBefore]
		);

		const syncSamples = await this.queryAll<{
			id: number;
			username: string;
			file_key: string;
			file_name: string;
			status: string;
			created_at: string;
		}>(
			`SELECT id, username, file_key, file_name, status, created_at FROM sync_queue
       WHERE status IN ('pending', 'processing') AND datetime(created_at) < datetime(?)
       ORDER BY created_at ASC LIMIT ?`,
			[opts.syncQueueStuckBefore, lim]
		);
		const syncCountRow = await this.queryFirst<{ c: number }>(
			`SELECT COUNT(*) AS c FROM sync_queue
       WHERE status IN ('pending', 'processing') AND datetime(created_at) < datetime(?)`,
			[opts.syncQueueStuckBefore]
		);

		const rebuildSamples = await this.queryAll<{
			id: string;
			campaign_id: string;
			status: string;
			started_at: string | null;
			created_at: string;
		}>(
			`SELECT id, campaign_id, status, started_at, created_at FROM rebuild_status
       WHERE status IN ('pending', 'in_progress')
         AND datetime(COALESCE(started_at, created_at)) < datetime(?)
       ORDER BY COALESCE(started_at, created_at) ASC LIMIT ?`,
			[opts.rebuildStuckBefore, lim]
		);
		const rebuildCountRow = await this.queryFirst<{ c: number }>(
			`SELECT COUNT(*) AS c FROM rebuild_status
       WHERE status IN ('pending', 'in_progress')
         AND datetime(COALESCE(started_at, created_at)) < datetime(?)`,
			[opts.rebuildStuckBefore]
		);

		const chunkSamples = await this.queryAll<{
			id: string;
			file_key: string;
			chunk_index: number;
			status: string;
			created_at: string;
		}>(
			`SELECT id, file_key, chunk_index, status, created_at FROM file_processing_chunks
       WHERE status IN ('pending', 'processing') AND datetime(created_at) < datetime(?)
       ORDER BY created_at ASC LIMIT ?`,
			[opts.fileChunkStuckBefore, lim]
		);
		const chunkCountRow = await this.queryFirst<{ c: number }>(
			`SELECT COUNT(*) AS c FROM file_processing_chunks
       WHERE status IN ('pending', 'processing') AND datetime(created_at) < datetime(?)`,
			[opts.fileChunkStuckBefore]
		);

		const toSample = (
			kind: StuckJobSample["kind"],
			row: {
				created_at: string;
				id: string | number;
				campaign_id?: string;
				username?: string;
				file_key?: string;
				file_name?: string;
				resource_name?: string;
				status?: string;
				started_at?: string | null;
				chunk_index?: number;
			}
		): StuckJobSample => {
			const t = new Date(row.created_at).getTime();
			const ageMinutes = Math.max(0, (nowMs - t) / 60000);
			const base: StuckJobSample = {
				kind,
				id: String(row.id),
				ageMinutes: Math.round(ageMinutes * 10) / 10,
				status: row.status,
			};
			if (row.campaign_id) base.campaignId = row.campaign_id;
			if (row.username) base.username = row.username;
			if (kind === "entity_extraction" && row.resource_name)
				base.detail = row.resource_name;
			if (kind === "sync_queue" && row.file_name) base.detail = row.file_name;
			if (kind === "file_processing_chunk" && row.file_key != null)
				base.detail = `${row.file_key}#${row.chunk_index ?? ""}`;
			return base;
		};

		return {
			entityExtraction: {
				count: entityCountRow?.c ?? 0,
				samples: entitySamples.map((r) =>
					toSample("entity_extraction", {
						id: r.id,
						campaign_id: r.campaign_id,
						username: r.username,
						resource_name: r.resource_name,
						status: r.status,
						created_at: r.status === "processing" ? r.updated_at : r.created_at,
					})
				),
			},
			syncQueue: {
				count: syncCountRow?.c ?? 0,
				samples: syncSamples.map((r) =>
					toSample("sync_queue", { ...r, id: r.id })
				),
			},
			rebuild: {
				count: rebuildCountRow?.c ?? 0,
				samples: rebuildSamples.map((r) =>
					toSample("rebuild", {
						...r,
						id: r.id,
						created_at: r.started_at || r.created_at,
					})
				),
			},
			fileChunks: {
				count: chunkCountRow?.c ?? 0,
				samples: chunkSamples.map((r) =>
					toSample("file_processing_chunk", { ...r, id: r.id })
				),
			},
		};
	}

	async getRebuildHealth(
		fromDate: string,
		toDate: string
	): Promise<RebuildHealthAnalytics> {
		const statusRows = await this.queryAll<{ status: string; c: number }>(
			`SELECT status, COUNT(*) AS c FROM rebuild_status
       WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)
       GROUP BY status`,
			[fromDate, toDate]
		);
		const countsByStatusInWindow: Record<string, number> = {};
		let completedInWindow = 0;
		for (const r of statusRows) {
			countsByStatusInWindow[r.status] = r.c;
			if (r.status === "completed") completedInWindow = r.c;
		}

		const metaRows = await this.queryAll<{ metadata: string | null }>(
			`SELECT metadata FROM rebuild_status
       WHERE status = 'completed'
         AND datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)`,
			[fromDate, toDate]
		);
		const durations: number[] = [];
		for (const row of metaRows) {
			if (!row.metadata) continue;
			try {
				const m = JSON.parse(row.metadata) as { duration?: number };
				if (typeof m.duration === "number" && Number.isFinite(m.duration)) {
					durations.push(m.duration);
				}
			} catch {
				/* skip */
			}
		}
		const count = durations.length;
		const avg = count > 0 ? durations.reduce((a, b) => a + b, 0) / count : null;

		return {
			countsByStatusInWindow,
			completedInWindow,
			completedDurationMs: {
				count,
				avg,
				median: median(durations),
			},
		};
	}

	async getDigestFunnel(
		fromDate: string,
		toDate: string
	): Promise<DigestFunnelAnalytics> {
		const rows = await this.queryAll<{ status: string; c: number }>(
			`SELECT status, COUNT(*) AS c FROM session_digests
       WHERE datetime(updated_at) >= datetime(?) AND datetime(updated_at) <= datetime(?)
       GROUP BY status`,
			[fromDate, toDate]
		);
		const countsByStatusInWindow: Record<string, number> = {};
		for (const r of rows) countsByStatusInWindow[r.status] = r.c;
		return { countsByStatusInWindow };
	}

	async getDedupAnalytics(
		fromDate: string,
		toDate: string
	): Promise<DedupAnalytics> {
		const pendingRow = await this.queryFirst<{
			c: number;
			oldest: string | null;
		}>(
			`SELECT COUNT(*) AS c, MIN(created_at) AS oldest FROM entity_deduplication_pending
       WHERE status = 'pending'`
		);
		const resolvedRow = await this.queryFirst<{ c: number }>(
			`SELECT COUNT(*) AS c FROM entity_deduplication_pending
       WHERE status != 'pending'
         AND resolved_at IS NOT NULL
         AND datetime(resolved_at) >= datetime(?) AND datetime(resolved_at) <= datetime(?)`,
			[fromDate, toDate]
		);
		let oldestPendingAgeHours: number | null = null;
		if (pendingRow?.oldest) {
			const t = new Date(pendingRow.oldest).getTime();
			oldestPendingAgeHours = (Date.now() - t) / (3600 * 1000);
		}
		return {
			pendingCount: pendingRow?.c ?? 0,
			oldestPendingAgeHours:
				oldestPendingAgeHours !== null
					? Math.round(oldestPendingAgeHours * 10) / 10
					: null,
			resolvedInWindow: resolvedRow?.c ?? 0,
		};
	}

	async getGrowth(fromDate: string, toDate: string): Promise<GrowthAnalytics> {
		const cRow = await this.queryFirst<{ c: number }>(
			`SELECT COUNT(*) AS c FROM campaigns
       WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)`,
			[fromDate, toDate]
		);
		const rRow = await this.queryFirst<{ c: number }>(
			`SELECT COUNT(*) AS c FROM campaign_resources
       WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)`,
			[fromDate, toDate]
		);
		return {
			campaignsCreatedInWindow: cRow?.c ?? 0,
			resourcesCreatedInWindow: rRow?.c ?? 0,
		};
	}

	async getLibraryHealth(): Promise<LibraryHealthAnalytics> {
		const statusRows = await this.queryAll<{ status: string; c: number }>(
			`SELECT COALESCE(status, '') AS status, COUNT(*) AS c FROM file_metadata GROUP BY status`
		);
		const statusDistribution: Record<string, number> = {};
		for (const r of statusRows) statusDistribution[r.status || "unknown"] = r.c;

		const errRow = await this.queryFirst<{ c: number }>(
			`SELECT COUNT(*) AS c FROM file_metadata WHERE processing_error IS NOT NULL AND TRIM(processing_error) != ''`
		);
		const memRow = await this.queryFirst<{ c: number }>(
			`SELECT COUNT(*) AS c FROM file_metadata
       WHERE processing_error LIKE '%MEMORY_LIMIT_EXCEEDED%' OR processing_error LIKE '%MEMORY_LIMIT%'`
		);
		const analysisRows = await this.queryAll<{
			analysis_status: string;
			c: number;
		}>(
			`SELECT COALESCE(analysis_status, '') AS analysis_status, COUNT(*) AS c FROM file_metadata GROUP BY analysis_status`
		);
		const analysisStatusDistribution: Record<string, number> = {};
		for (const r of analysisRows) {
			analysisStatusDistribution[r.analysis_status || "unknown"] = r.c;
		}

		return {
			statusDistribution,
			withProcessingError: errRow?.c ?? 0,
			memoryLimitExceeded: memRow?.c ?? 0,
			analysisStatusDistribution,
		};
	}

	async getUsageAnalytics(
		fromDate: string,
		toDate: string,
		topN: number
	): Promise<UsageAnalytics> {
		const msgRows = await this.queryAll<{ username: string; c: number }>(
			`SELECT username, COUNT(*) AS c FROM message_history
       WHERE username IS NOT NULL AND TRIM(username) != ''
         AND datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)
       GROUP BY username ORDER BY c DESC LIMIT ?`,
			[fromDate, toDate, topN]
		);
		const topByMessages: UsageLeaderRow[] = msgRows.map((r) => ({
			username: r.username,
			messageCount: r.c,
		}));

		let topByMonthlyTokens: UsageLeaderRow[] = [];
		if (await this.hasTable("user_monthly_usage")) {
			const ym = toDate.slice(0, 7);
			const tokenRows = await this.queryAll<{
				username: string;
				tokens: number;
				year_month: string;
			}>(
				`SELECT username, tokens, year_month FROM user_monthly_usage
         WHERE year_month = ?
         ORDER BY tokens DESC LIMIT ?`,
				[ym, topN]
			);
			topByMonthlyTokens = tokenRows.map((r) => ({
				username: r.username,
				tokens: r.tokens,
				yearMonth: r.year_month,
			}));
		}

		let topByLifetimeFreeTier: UsageLeaderRow[] = [];
		if (await this.hasTable("user_free_tier_usage")) {
			const ftRows = await this.queryAll<{
				username: string;
				tokens_used: number;
			}>(
				`SELECT username, tokens_used FROM user_free_tier_usage ORDER BY tokens_used DESC LIMIT ?`,
				[topN]
			);
			topByLifetimeFreeTier = ftRows.map((r) => ({
				username: r.username,
				tokensUsed: r.tokens_used,
			}));
		}

		return {
			topByMessages,
			topByMonthlyTokens,
			topByLifetimeFreeTier,
		};
	}
}
