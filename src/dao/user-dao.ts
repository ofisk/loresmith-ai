import { BaseDAOClass } from "./base-dao";

export interface UserOpenAIKey {
  username: string;
  api_key: string;
  updated_at: string;
}

export interface UserStorageUsage {
  username: string;
  total_size: number;
  file_count: number;
}

export class UserDAO extends BaseDAOClass {
  async storeOpenAIKey(username: string, apiKey: string): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO user_openai_keys (username, api_key, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `;
    await this.execute(sql, [username, apiKey]);
  }

  async getOpenAIKey(username: string): Promise<string | null> {
    const sql = "SELECT api_key FROM user_openai_keys WHERE username = ?";
    const result = await this.queryFirst<{ api_key: string }>(sql, [username]);
    return result?.api_key || null;
  }

  async deleteOpenAIKey(username: string): Promise<void> {
    const sql = "DELETE FROM user_openai_keys WHERE username = ?";
    await this.execute(sql, [username]);
  }

  async hasOpenAIKey(username: string): Promise<boolean> {
    const sql = "SELECT 1 FROM user_openai_keys WHERE username = ?";
    const result = await this.queryFirst<{ 1: number }>(sql, [username]);
    return result !== null;
  }

  async getStorageUsage(username: string): Promise<UserStorageUsage> {
    const sql = `
      SELECT 
        username,
        COALESCE(SUM(file_size), 0) as total_size,
        COUNT(*) as file_count
      FROM file_metadata 
      WHERE username = ?
      GROUP BY username
    `;

    const result = await this.queryFirst<UserStorageUsage>(sql, [username]);

    return (
      result || {
        username,
        total_size: 0,
        file_count: 0,
      }
    );
  }

  async getAllUsersStorageUsage(): Promise<UserStorageUsage[]> {
    const sql = `
      SELECT 
        username,
        COALESCE(SUM(file_size), 0) as total_size,
        COUNT(*) as file_count
      FROM file_metadata 
      GROUP BY username
      ORDER BY total_size DESC
    `;

    return await this.queryAll<UserStorageUsage>(sql);
  }

  async getUserActivity(username: string): Promise<{
    campaign_count: number;
    file_count: number;
    last_activity: string | null;
  }> {
    const sql = `
      SELECT 
        (SELECT COUNT(*) FROM campaigns WHERE username = ?) as campaign_count,
        (SELECT COUNT(*) FROM file_metadata WHERE username = ?) as file_count,
        (SELECT MAX(updated_at) FROM (
          SELECT updated_at FROM campaigns WHERE username = ?
          UNION ALL
          SELECT updated_at FROM file_metadata WHERE username = ?
        )) as last_activity
    `;

    const result = await this.queryFirst<{
      campaign_count: number;
      file_count: number;
      last_activity: string | null;
    }>(sql, [username, username, username, username]);

    return (
      result || {
        campaign_count: 0,
        file_count: 0,
        last_activity: null,
      }
    );
  }
}
