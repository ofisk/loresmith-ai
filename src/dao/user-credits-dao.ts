import { BaseDAOClass } from "./base-dao";

export class UserCreditsDAO extends BaseDAOClass {
	async getCredits(username: string): Promise<number> {
		const row = await this.queryFirst<{ tokens_remaining: number }>(
			"SELECT tokens_remaining FROM user_indexing_credits WHERE username = ?",
			[username]
		);
		return row?.tokens_remaining ?? 0;
	}

	async addCredits(username: string, amount: number): Promise<void> {
		const now = new Date().toISOString();
		const sql = `
      INSERT INTO user_indexing_credits (username, tokens_remaining, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        tokens_remaining = tokens_remaining + excluded.tokens_remaining,
        updated_at = excluded.updated_at
    `;
		await this.execute(sql, [username, amount, now, now]);
	}
}
