import { BaseDAOClass } from "./base-dao";

function getToday(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export class FileRetryUsageDAO extends BaseDAOClass {
	async incrementRetry(username: string, fileKey: string): Promise<void> {
		const retryDate = getToday();
		const now = new Date().toISOString();

		const sql = `
      INSERT INTO file_retry_usage (username, file_key, retry_date, retry_count, updated_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(username, file_key, retry_date) DO UPDATE SET
        retry_count = retry_count + 1,
        updated_at = ?
    `;
		await this.execute(sql, [username, fileKey, retryDate, now, now]);
	}

	async getRetriesForFileToday(
		username: string,
		fileKey: string
	): Promise<number> {
		const retryDate = getToday();
		const sql = `
      SELECT COALESCE(retry_count, 0) as retry_count
      FROM file_retry_usage
      WHERE username = ? AND file_key = ? AND retry_date = ?
    `;
		const row = await this.queryFirst<{ retry_count: number }>(sql, [
			username,
			fileKey,
			retryDate,
		]);
		return row?.retry_count ?? 0;
	}

	async getRetriesForFileThisMonth(
		username: string,
		fileKey: string
	): Promise<number> {
		const now = new Date();
		const yearMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

		const sql = `
      SELECT COALESCE(SUM(retry_count), 0) as total
      FROM file_retry_usage
      WHERE username = ? AND file_key = ? AND retry_date LIKE ?
    `;
		const row = await this.queryFirst<{ total: number }>(sql, [
			username,
			fileKey,
			`${yearMonthPrefix}%`,
		]);
		return row?.total ?? 0;
	}
}
