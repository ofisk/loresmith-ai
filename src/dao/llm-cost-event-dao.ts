import type { LlmSpendSurface } from "@/lib/llm-usage-intents";
import type {
	CostBreakdownRow,
	CostDimension,
	CostPerTierRow,
	CostTotals,
	TopSpenderRow,
} from "@/types/cost-attribution";
import { BaseDAOClass } from "./base-dao";

/** Retention for attribution data. Long enough to compare month over month. */
export const COST_EVENT_RETENTION_DAYS = 90;

export interface CostEventInsert {
	username: string;
	tier: string | null;
	intent: string;
	source?: string | null;
	agent?: string | null;
	model?: string | null;
	provider?: string | null;
	modelRole?: string | null;
	surface: LlmSpendSurface;
	promptTokens: number;
	completionTokens: number;
	cachedInputTokens: number;
	cacheWriteTokens: number;
	totalTokens: number;
	queryCount: number;
	costUsd: number;
	priced: boolean;
}

export interface CostWindow {
	fromDate: string;
	toDate: string;
}

/**
 * Whitelist mapping API dimension names to columns. Dimension names arrive from
 * query strings, so they must never be interpolated into SQL directly.
 */
const DIMENSION_COLUMNS: Record<CostDimension, string> = {
	agent: "agent",
	intent: "intent",
	model: "model",
	modelRole: "model_role",
	surface: "surface",
	tier: "tier",
};

const UNATTRIBUTED = "unattributed";

interface RawBreakdownRow {
	key: string | null;
	cost_usd: number | null;
	total_tokens: number | null;
	prompt_tokens: number | null;
	completion_tokens: number | null;
	cached_input_tokens: number | null;
	cache_write_tokens: number | null;
	query_count: number | null;
	event_count: number | null;
	unpriced_events: number | null;
}

function n(value: number | null | undefined): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export class LLMCostEventDAO extends BaseDAOClass {
	/**
	 * False until migration 0030 has been applied. Read paths check this so the
	 * admin dashboard degrades to "no data" instead of erroring on an environment
	 * that has not migrated yet.
	 */
	async isAvailable(): Promise<boolean> {
		return this.hasTable("llm_cost_events");
	}

	async insertEvent(event: CostEventInsert): Promise<void> {
		const sql = `
      INSERT INTO llm_cost_events (
        username, tier, intent, source, agent, model, provider, model_role,
        surface, prompt_tokens, completion_tokens, cached_input_tokens,
        cache_write_tokens, total_tokens, query_count, cost_usd, priced, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `;
		await this.execute(sql, [
			event.username,
			event.tier,
			event.intent,
			event.source ?? null,
			event.agent ?? null,
			event.model ?? null,
			event.provider ?? null,
			event.modelRole ?? null,
			event.surface,
			event.promptTokens,
			event.completionTokens,
			event.cachedInputTokens,
			event.cacheWriteTokens,
			event.totalTokens,
			event.queryCount,
			event.costUsd,
			event.priced ? 1 : 0,
		]);
	}

	async getTotals(window: CostWindow): Promise<CostTotals> {
		const rows = await this.queryAll<{
			cost_usd: number | null;
			total_tokens: number | null;
			prompt_tokens: number | null;
			completion_tokens: number | null;
			cached_input_tokens: number | null;
			cache_write_tokens: number | null;
			query_count: number | null;
			event_count: number | null;
			unpriced_events: number | null;
			distinct_users: number | null;
		}>(
			`SELECT
         COALESCE(SUM(cost_usd), 0) AS cost_usd,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
         COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
         COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
         COALESCE(SUM(query_count), 0) AS query_count,
         COUNT(*) AS event_count,
         COALESCE(SUM(CASE WHEN priced = 0 THEN 1 ELSE 0 END), 0) AS unpriced_events,
         COUNT(DISTINCT username) AS distinct_users
       FROM llm_cost_events
       WHERE created_at >= ? AND created_at <= ?`,
			[window.fromDate, window.toDate]
		);
		const r = rows[0];
		const promptTokens = n(r?.prompt_tokens);
		const cachedInputTokens = n(r?.cached_input_tokens);
		const inputTotal = promptTokens + cachedInputTokens;
		return {
			costUsd: n(r?.cost_usd),
			totalTokens: n(r?.total_tokens),
			promptTokens,
			completionTokens: n(r?.completion_tokens),
			cachedInputTokens,
			cacheWriteTokens: n(r?.cache_write_tokens),
			queryCount: n(r?.query_count),
			eventCount: n(r?.event_count),
			unpricedEvents: n(r?.unpriced_events),
			distinctUsers: n(r?.distinct_users),
			cacheHitRate: inputTotal > 0 ? cachedInputTokens / inputTotal : 0,
		};
	}

	/**
	 * Spend grouped by one dimension, most expensive first.
	 *
	 * `totalCostUsd` comes from the caller (the window totals) so every
	 * breakdown's shares are relative to the same denominator, even when `limit`
	 * truncates the tail.
	 */
	async getBreakdown(
		dimension: CostDimension,
		window: CostWindow,
		totalCostUsd: number,
		limit = 25
	): Promise<CostBreakdownRow[]> {
		const column = DIMENSION_COLUMNS[dimension];
		if (!column) {
			throw new Error(`Unsupported cost dimension: ${dimension}`);
		}
		const rows = await this.queryAll<RawBreakdownRow>(
			`SELECT
         ${column} AS key,
         COALESCE(SUM(cost_usd), 0) AS cost_usd,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
         COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
         COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
         COALESCE(SUM(query_count), 0) AS query_count,
         COUNT(*) AS event_count,
         COALESCE(SUM(CASE WHEN priced = 0 THEN 1 ELSE 0 END), 0) AS unpriced_events
       FROM llm_cost_events
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY ${column}
       ORDER BY cost_usd DESC, total_tokens DESC
       LIMIT ?`,
			[window.fromDate, window.toDate, limit]
		);

		return rows.map((row) => {
			const costUsd = n(row.cost_usd);
			return {
				key: row.key ?? UNATTRIBUTED,
				costUsd,
				costShare: totalCostUsd > 0 ? costUsd / totalCostUsd : 0,
				totalTokens: n(row.total_tokens),
				promptTokens: n(row.prompt_tokens),
				completionTokens: n(row.completion_tokens),
				cachedInputTokens: n(row.cached_input_tokens),
				cacheWriteTokens: n(row.cache_write_tokens),
				queryCount: n(row.query_count),
				eventCount: n(row.event_count),
				unpricedEvents: n(row.unpriced_events),
			};
		});
	}

	/** Cost-to-serve per tier: is Basic priced above what Basic costs to run? */
	async getCostPerTier(window: CostWindow): Promise<CostPerTierRow[]> {
		const rows = await this.queryAll<{
			tier: string | null;
			cost_usd: number | null;
			user_count: number | null;
			total_tokens: number | null;
			event_count: number | null;
		}>(
			`SELECT
         tier,
         COALESCE(SUM(cost_usd), 0) AS cost_usd,
         COUNT(DISTINCT username) AS user_count,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COUNT(*) AS event_count
       FROM llm_cost_events
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY tier
       ORDER BY cost_usd DESC`,
			[window.fromDate, window.toDate]
		);
		return rows.map((row) => {
			const costUsd = n(row.cost_usd);
			const userCount = n(row.user_count);
			return {
				tier: row.tier ?? UNATTRIBUTED,
				costUsd,
				userCount,
				costPerUserUsd: userCount > 0 ? costUsd / userCount : 0,
				totalTokens: n(row.total_tokens),
				eventCount: n(row.event_count),
			};
		});
	}

	async getTopSpenders(
		window: CostWindow,
		limit = 10
	): Promise<TopSpenderRow[]> {
		const rows = await this.queryAll<{
			username: string;
			tier: string | null;
			cost_usd: number | null;
			total_tokens: number | null;
			event_count: number | null;
		}>(
			`SELECT
         username,
         MAX(tier) AS tier,
         COALESCE(SUM(cost_usd), 0) AS cost_usd,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COUNT(*) AS event_count
       FROM llm_cost_events
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY username
       ORDER BY cost_usd DESC, total_tokens DESC
       LIMIT ?`,
			[window.fromDate, window.toDate, limit]
		);
		return rows.map((row) => ({
			username: row.username,
			tier: row.tier ?? UNATTRIBUTED,
			costUsd: n(row.cost_usd),
			totalTokens: n(row.total_tokens),
			eventCount: n(row.event_count),
		}));
	}

	/**
	 * Per-user spend since `sinceDate` — the input to cost-anomaly alerting.
	 * Ordered so the alert service can stop after the worst offenders.
	 */
	async getSpendByUserSince(
		sinceDate: string,
		limit = 25
	): Promise<{ username: string; costUsd: number; eventCount: number }[]> {
		const rows = await this.queryAll<{
			username: string;
			cost_usd: number | null;
			event_count: number | null;
		}>(
			`SELECT
         username,
         COALESCE(SUM(cost_usd), 0) AS cost_usd,
         COUNT(*) AS event_count
       FROM llm_cost_events
       WHERE created_at >= ?
       GROUP BY username
       ORDER BY cost_usd DESC
       LIMIT ?`,
			[sinceDate, limit]
		);
		return rows.map((row) => ({
			username: row.username,
			costUsd: n(row.cost_usd),
			eventCount: n(row.event_count),
		}));
	}

	async pruneOldRows(
		retentionDays: number = COST_EVENT_RETENTION_DAYS
	): Promise<number> {
		const result = await this.db
			.prepare(
				`DELETE FROM llm_cost_events WHERE created_at < datetime('now', ?)`
			)
			.bind(`-${retentionDays} days`)
			.run();
		return result.meta?.changes ?? 0;
	}
}
