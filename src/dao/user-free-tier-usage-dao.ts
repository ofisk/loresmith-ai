import { BaseDAOClass } from "./base-dao";

/**
 * Tracks tokens drawn from the free tier's one-time welcome grant.
 *
 * This counter never resets. It used to be the *only* free-tier bucket, so a
 * user whose `tokens_used` reached the cap was permanently locked out. Since
 * issue #746 the recurring monthly allowance in `user_monthly_usage` is drawn
 * first and this bucket only absorbs the overflow — which means every existing
 * row already holds exactly what it means under the new scheme (tokens taken
 * from the grant), and no backfill is needed.
 */
export class UserFreeTierUsageDAO extends BaseDAOClass {
	async getTrialUsage(username: string): Promise<number> {
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
