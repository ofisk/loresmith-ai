import { BaseDAOClass } from "./base-dao";

export class ResourceAddLogDAO extends BaseDAOClass {
	async recordAdd(username: string, campaignId: string): Promise<void> {
		const sql = `
      INSERT INTO resource_add_log (username, campaign_id, created_at)
      VALUES (?, ?, datetime('now'))
    `;
		await this.execute(sql, [username, campaignId]);
	}

	async getCountInLastHour(
		username: string,
		campaignId: string
	): Promise<number> {
		const rows = await this.queryAll<{ cnt: number }>(
			`SELECT COUNT(*) as cnt
       FROM resource_add_log
       WHERE username = ? AND campaign_id = ? AND created_at > datetime('now', '-1 hour')`,
			[username, campaignId]
		);
		return rows[0]?.cnt ?? 0;
	}

	async pruneOldRows(): Promise<number> {
		const result = await this.db
			.prepare(
				`DELETE FROM resource_add_log WHERE created_at < datetime('now', '-2 hours')`
			)
			.run();
		return result.meta?.changes ?? 0;
	}
}
