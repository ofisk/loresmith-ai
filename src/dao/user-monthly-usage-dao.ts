import { BaseDAOClass } from "./base-dao";

function getYearMonth(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
}

export class UserMonthlyUsageDAO extends BaseDAOClass {
	async incrementUsage(
		username: string,
		tokens: number,
		yearMonth?: string
	): Promise<void> {
		const ym = yearMonth ?? getYearMonth();
		const now = new Date().toISOString();

		const sql = `
      INSERT INTO user_monthly_usage (username, year_month, tokens, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(username, year_month) DO UPDATE SET
        tokens = tokens + ?,
        updated_at = ?
    `;
		await this.execute(sql, [username, ym, tokens, now, tokens, now]);
	}

	async getCurrentMonthUsage(username: string): Promise<number> {
		const ym = getYearMonth();
		const sql = `
      SELECT COALESCE(tokens, 0) as tokens
      FROM user_monthly_usage
      WHERE username = ? AND year_month = ?
    `;
		const row = await this.queryFirst<{ tokens: number }>(sql, [username, ym]);
		return row?.tokens ?? 0;
	}
}
