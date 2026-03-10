import { BaseDAOClass } from "./base-dao";

export interface UsageInWindow {
	tpm?: number;
	qpm?: number;
	tph?: number;
	qph?: number;
	tpd?: number;
	qpd?: number;
	oldestAt: string | null;
}

export class LLMUsageDAO extends BaseDAOClass {
	async insertUsage(
		username: string,
		tokens: number,
		queryCount: number,
		model?: string
	): Promise<void> {
		const sql = `
      INSERT INTO llm_usage_log (username, tokens, query_count, model, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `;
		await this.execute(sql, [username, tokens, queryCount, model ?? null]);
	}

	async getUsageInLastMinute(username: string): Promise<UsageInWindow> {
		const rows = await this.queryAll<{
			tpm: number;
			qpm: number;
			oldest_at: string | null;
		}>(
			`SELECT
        COALESCE(SUM(tokens), 0) as tpm,
        COALESCE(SUM(query_count), 0) as qpm,
        MIN(created_at) as oldest_at
      FROM llm_usage_log
      WHERE username = ? AND created_at > datetime('now', '-1 minute')`,
			[username]
		);
		const r = rows[0];
		if (!r) {
			return { tpm: 0, qpm: 0, oldestAt: null };
		}
		return {
			tpm: r.tpm ?? 0,
			qpm: r.qpm ?? 0,
			oldestAt: r.oldest_at ?? null,
		};
	}

	async getUsageInLastHour(username: string): Promise<UsageInWindow> {
		const rows = await this.queryAll<{
			tph: number;
			qph: number;
			oldest_at: string | null;
		}>(
			`SELECT
        COALESCE(SUM(tokens), 0) as tph,
        COALESCE(SUM(query_count), 0) as qph,
        MIN(created_at) as oldest_at
      FROM llm_usage_log
      WHERE username = ? AND created_at > datetime('now', '-1 hour')`,
			[username]
		);
		const r = rows[0];
		if (!r) {
			return { tph: 0, qph: 0, oldestAt: null };
		}
		return {
			tph: r.tph ?? 0,
			qph: r.qph ?? 0,
			oldestAt: r.oldest_at ?? null,
		};
	}

	async getUsageInLast24Hours(username: string): Promise<UsageInWindow> {
		const rows = await this.queryAll<{
			tpd: number;
			qpd: number;
			oldest_at: string | null;
		}>(
			`SELECT
        COALESCE(SUM(tokens), 0) as tpd,
        COALESCE(SUM(query_count), 0) as qpd,
        MIN(created_at) as oldest_at
      FROM llm_usage_log
      WHERE username = ? AND created_at > datetime('now', '-24 hours')`,
			[username]
		);
		const r = rows[0];
		if (!r) {
			return { tpd: 0, qpd: 0, oldestAt: null };
		}
		return {
			tpd: r.tpd ?? 0,
			qpd: r.qpd ?? 0,
			oldestAt: r.oldest_at ?? null,
		};
	}

	async pruneOldRows(): Promise<number> {
		const result = await this.db
			.prepare(
				`DELETE FROM llm_usage_log WHERE created_at < datetime('now', '-25 hours')`
			)
			.run();
		return result.meta?.changes ?? 0;
	}
}
