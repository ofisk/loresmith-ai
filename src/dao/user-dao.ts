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
      insert or replace into user_openai_keys (username, api_key, updated_at)
      values (?, ?, current_timestamp)
    `;
    await this.execute(sql, [username, apiKey]);
  }

  async getOpenAIKey(username: string): Promise<string | null> {
    const sql = "select api_key from user_openai_keys where username = ?";
    const result = await this.queryFirst<{ api_key: string }>(sql, [username]);
    return result?.api_key || null;
  }

  async deleteOpenAIKey(username: string): Promise<void> {
    const sql = "delete from user_openai_keys where username = ?";
    await this.execute(sql, [username]);
  }

  async hasOpenAIKey(username: string): Promise<boolean> {
    const sql = "select 1 from user_openai_keys where username = ?";
    const result = await this.queryFirst<{ 1: number }>(sql, [username]);
    return result !== null;
  }

  async getStorageUsage(username: string): Promise<UserStorageUsage> {
    const sql = `
      select
        username,
        coalesce(sum(file_size), 0) as total_size,
        count(*) as file_count
      from file_metadata
      where username = ?
      group by username
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
      select
        username,
        coalesce(sum(file_size), 0) as total_size,
        count(*) as file_count
      from file_metadata
      group by username
      order by total_size desc
    `;

    return await this.queryAll<UserStorageUsage>(sql);
  }

  async getUserActivity(username: string): Promise<{
    campaign_count: number;
    file_count: number;
    last_activity: string | null;
  }> {
    const sql = `
      select
        (select count(*) from campaigns where username = ?) as campaign_count,
        (select count(*) from file_metadata where username = ?) as file_count,
        (select max(updated_at) from (
          select updated_at from campaigns where username = ?
          union all
          select updated_at from file_metadata where username = ?
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
