import { BaseDAOClass } from "./base-dao";

export interface UserStorageUsage {
  username: string;
  total_size: number;
  file_count: number;
}

export class UserDAO extends BaseDAOClass {
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
}
