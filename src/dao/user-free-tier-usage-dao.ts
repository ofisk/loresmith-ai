import { BaseDAOClass } from "./base-dao";

/**
 * Tracks cumulative token usage for free-tier one-time trial.
 * Usage never resets; when lifetimeTokens limit is exceeded, user must upgrade.
 */
export class UserFreeTierUsageDAO extends BaseDAOClass {
	async getLifetimeUsage(username: string): Promise<number> {
		const row = await this.queryFirst<{ tokens_used: number }>(
			"SELECT tokens_used FROM user_free_tier_usage WHERE username = ?",
			[username]
		);
		return row?.tokens_used ?? 0;
	}

	async incrementUsage(username: string, tokens: number): Promise<void> {
		const now = new Date().toISOString();
		const sql = `
      INSERT INTO user_free_tier_usage (username, tokens_used, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        tokens_used = tokens_used + excluded.tokens_used,
        updated_at = excluded.updated_at
    `;
		await this.execute(sql, [username, tokens, now]);
	}
}
