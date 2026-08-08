import { BaseDAOClass } from "@/dao/base-dao";
import { parseSummary, serializeSummary } from "@/lib/agent-activity-summary";
import type {
	AgentActivityActionType,
	AgentActivityQuery,
	AgentActivityRecord,
	AgentActivityStatus,
	AgentActivitySummaryCounts,
	StartAgentActivityInput,
} from "@/types/agent-activity";
import { AGENT_ACTIVITY_STATUS } from "@/types/agent-activity";
import type { SqlParam, SqlParams } from "@/types/utils";

/** Raw row shape, matching migration 0036. */
export interface AgentActivityRow {
	id: string;
	username: string;
	agent_type: string;
	campaign_id: string | null;
	session_id: string;
	action_type: string;
	tool_name: string | null;
	status: string;
	parent_id: string | null;
	root_id: string;
	started_at: string;
	ended_at: string | null;
	duration_ms: number | null;
	summary: string | null;
	error: string | null;
}

/**
 * How long a row lives. Shorter than the 90-day cost ledger on purpose: this
 * table gains a row per tool call rather than per turn, and its readers — a
 * live dashboard, a "what did the agent just do" panel — care about the last
 * few days. Anything needing a longer horizon should aggregate into telemetry.
 */
export const AGENT_ACTIVITY_RETENTION_DAYS = 14;

/** Page size when a caller does not ask for one, and the ceiling if it does. */
const DEFAULT_QUERY_LIMIT = 50;
const MAX_QUERY_LIMIT = 200;

/** A row queued for persistence, already merged to its latest known state. */
export interface PendingAgentActivityWrite extends StartAgentActivityInput {
	status: AgentActivityStatus;
	endedAt: string | null;
	durationMs: number | null;
	error: string | null;
}

const SELECT_COLUMNS = `id, username, agent_type, campaign_id, session_id,
       action_type, tool_name, status, parent_id, root_id,
       started_at, ended_at, duration_ms, summary, error`;

/**
 * Persistence for the agent activity log (issue #739).
 *
 * Every method degrades to a no-op or an empty result when the table is absent.
 * Merging to `main` deploys the Worker automatically but does not apply D1
 * migrations, and this table is written from inside the tool-execution path —
 * throwing during that window would not lose a log line, it would break every
 * agent in production.
 */
export class AgentActivityDAO extends BaseDAOClass {
	async isSchemaReady(): Promise<boolean> {
		return this.hasTable("agent_activity");
	}

	/**
	 * Write a batch of rows, inserting or updating each by id.
	 *
	 * An upsert rather than separate insert-on-start and update-on-finish calls,
	 * because the recorder merges a row's start and finish in memory whenever
	 * both happen before a flush — the common case for a fast tool. One
	 * statement shape then covers "first write" and "second write" identically,
	 * and replaying a batch is harmless.
	 *
	 * `started_at` and the identity columns are deliberately not updated on
	 * conflict: a later write only ever learns how an action ended.
	 */
	async saveMany(rows: PendingAgentActivityWrite[]): Promise<void> {
		if (rows.length === 0) return;
		if (!(await this.isSchemaReady())) return;

		const sql = `INSERT INTO agent_activity (
        id, username, agent_type, campaign_id, session_id,
        action_type, tool_name, status, parent_id, root_id,
        started_at, ended_at, duration_ms, summary, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        ended_at = excluded.ended_at,
        duration_ms = excluded.duration_ms,
        summary = COALESCE(excluded.summary, agent_activity.summary),
        error = excluded.error`;

		const statements = rows.map((row) =>
			this.db
				.prepare(sql)
				.bind(
					row.id,
					row.username,
					row.agentType,
					row.campaignId,
					row.sessionId,
					row.actionType,
					row.toolName,
					row.status,
					row.parentId,
					row.rootId,
					row.startedAt,
					row.endedAt,
					row.durationMs,
					serializeSummary(row.summary),
					row.error
				)
		);

		await this.db.batch(statements);
	}

	/**
	 * Read one user's activity, newest first.
	 *
	 * `username` is not optional on the query type, so there is no way to call
	 * this without scoping to a caller — the row's denormalized username is the
	 * whole authorization check, and losing it silently would leak other users'
	 * campaigns.
	 */
	async query(options: AgentActivityQuery): Promise<AgentActivityRecord[]> {
		if (!(await this.isSchemaReady())) return [];

		const { where, params } = this.buildFilters(options);
		const limit = Math.min(
			Math.max(options.limit ?? DEFAULT_QUERY_LIMIT, 1),
			MAX_QUERY_LIMIT
		);
		const offset = Math.max(options.offset ?? 0, 0);

		const rows = await this.queryAll<AgentActivityRow>(
			`SELECT ${SELECT_COLUMNS}
         FROM agent_activity
        ${where}
        ORDER BY started_at DESC, rowid DESC
        LIMIT ? OFFSET ?`,
			[...params, limit, offset]
		);

		return rows.map(mapRowToRecord);
	}

	/**
	 * Every action in one delegation tree, oldest first.
	 *
	 * Ordered ascending because a tree is read as a narrative — the delegating
	 * call, then what the delegate did — unlike the reverse-chronological feed.
	 */
	async getTree(
		rootId: string,
		username: string
	): Promise<AgentActivityRecord[]> {
		if (!(await this.isSchemaReady())) return [];

		const rows = await this.queryAll<AgentActivityRow>(
			`SELECT ${SELECT_COLUMNS}
         FROM agent_activity
        WHERE root_id = ? AND username = ?
        ORDER BY started_at ASC, rowid ASC`,
			[rootId, username]
		);

		return rows.map(mapRowToRecord);
	}

	/**
	 * Header counts over the same filters as `query`, minus paging.
	 *
	 * Two aggregate queries rather than counting the returned page: the page is
	 * capped at 200 rows, so counting it would silently understate any window
	 * busier than that.
	 */
	async getSummaryCounts(
		options: AgentActivityQuery
	): Promise<AgentActivitySummaryCounts> {
		const empty: AgentActivitySummaryCounts = {
			total: 0,
			running: 0,
			succeeded: 0,
			failed: 0,
			byAgentType: {},
		};
		if (!(await this.isSchemaReady())) return empty;

		const { where, params } = this.buildFilters(options);

		const [byStatus, byAgent] = await Promise.all([
			this.queryAll<{ status: string; count: number }>(
				`SELECT status, COUNT(*) AS count FROM agent_activity ${where} GROUP BY status`,
				params
			),
			this.queryAll<{ agent_type: string; count: number }>(
				`SELECT agent_type, COUNT(*) AS count FROM agent_activity ${where} GROUP BY agent_type`,
				params
			),
		]);

		const counts = { ...empty, byAgentType: {} as Record<string, number> };
		for (const row of byStatus) {
			const count = Number(row.count) || 0;
			counts.total += count;
			if (row.status === AGENT_ACTIVITY_STATUS.RUNNING) counts.running += count;
			if (row.status === AGENT_ACTIVITY_STATUS.SUCCEEDED)
				counts.succeeded += count;
			if (row.status === AGENT_ACTIVITY_STATUS.FAILED) counts.failed += count;
		}
		for (const row of byAgent) {
			counts.byAgentType[row.agent_type] = Number(row.count) || 0;
		}
		return counts;
	}

	/** Age-based eviction, run from the fast cron alongside the other sweeps. */
	async pruneOldRows(
		retentionDays: number = AGENT_ACTIVITY_RETENTION_DAYS
	): Promise<number> {
		if (!(await this.isSchemaReady())) return 0;
		return this.executeReturningChanges(
			`DELETE FROM agent_activity WHERE started_at < datetime('now', ?)`,
			[`-${retentionDays} days`]
		);
	}

	/**
	 * Close out rows left `running` by a Worker that died mid-tool-call.
	 *
	 * Without this the dashboard shows perpetual in-flight work: the finish
	 * write is best-effort by design, so an eviction or an unhandled crash
	 * strands the row. Marked `failed`, not `cancelled` — nobody asked for it to
	 * stop, it simply never came back.
	 */
	async failStaleRunningRows(olderThanMinutes = 30): Promise<number> {
		if (!(await this.isSchemaReady())) return 0;
		return this.executeReturningChanges(
			`UPDATE agent_activity
          SET status = ?, ended_at = datetime('now'), error = ?
        WHERE status = ? AND started_at < datetime('now', ?)`,
			[
				AGENT_ACTIVITY_STATUS.FAILED,
				"Abandoned: no completion recorded",
				AGENT_ACTIVITY_STATUS.RUNNING,
				`-${olderThanMinutes} minutes`,
			]
		);
	}

	/** Shared WHERE builder so the list and its counts can never drift apart. */
	private buildFilters(options: AgentActivityQuery): {
		where: string;
		params: SqlParams;
	} {
		const conditions: string[] = ["username = ?"];
		const params: SqlParam[] = [options.username];

		if (options.campaignId) {
			conditions.push("campaign_id = ?");
			params.push(options.campaignId);
		}
		if (options.sessionId) {
			conditions.push("session_id = ?");
			params.push(options.sessionId);
		}
		if (options.agentType) {
			conditions.push("agent_type = ?");
			params.push(options.agentType);
		}
		if (options.status) {
			conditions.push("status = ?");
			params.push(options.status);
		}
		if (options.since) {
			conditions.push("started_at >= ?");
			params.push(options.since);
		}

		return { where: `WHERE ${conditions.join(" AND ")}`, params };
	}
}

export function mapRowToRecord(row: AgentActivityRow): AgentActivityRecord {
	return {
		id: row.id,
		username: row.username,
		agentType: row.agent_type,
		campaignId: row.campaign_id,
		sessionId: row.session_id,
		actionType: row.action_type as AgentActivityActionType,
		toolName: row.tool_name,
		status: row.status as AgentActivityStatus,
		parentId: row.parent_id,
		rootId: row.root_id,
		startedAt: row.started_at,
		endedAt: row.ended_at,
		durationMs: row.duration_ms,
		summary: parseSummary(row.summary),
		error: row.error,
	};
}
