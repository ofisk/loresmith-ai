import type { D1Database } from "@cloudflare/workers-types";

export interface BaseDAO {
  db: D1Database;
}

export abstract class BaseDAOClass implements BaseDAO {
  constructor(public db: D1Database) {}

  protected async queryAll<T = any>(
    sql: string,
    params: any[] = []
  ): Promise<T[]> {
    try {
      const stmt = this.db.prepare(sql);
      const result = await stmt.bind(...params).all<T>();
      return result.results || [];
    } catch (error) {
      console.error(`Database query error (queryAll): ${sql}`, error);
      throw new Error(
        `Database query failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  protected async queryFirst<T = any>(
    sql: string,
    params: any[] = []
  ): Promise<T | null> {
    try {
      const stmt = this.db.prepare(sql);
      const result = await stmt.bind(...params).first<T>();
      return result;
    } catch (error) {
      console.error(`Database query error (queryFirst): ${sql}`, error);
      throw new Error(
        `Database query failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  protected async execute(sql: string, params: any[] = []): Promise<void> {
    try {
      const stmt = this.db.prepare(sql);
      await stmt.bind(...params).run();
    } catch (error) {
      console.error(`Database execute error: ${sql}`, error);
      throw new Error(
        `Database execute failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  protected async executeAndGetId(
    sql: string,
    params: any[] = []
  ): Promise<number> {
    try {
      const stmt = this.db.prepare(sql);
      const result = await stmt.bind(...params).run();
      return result.meta?.last_row_id || 0;
    } catch (error) {
      console.error(`Database execute error: ${sql}`, error);
      throw new Error(
        `Database execute failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  protected async transaction<T>(
    operations: (() => Promise<T>)[]
  ): Promise<T[]> {
    try {
      return await Promise.all(operations.map((op) => op()));
    } catch (error) {
      console.error("Database transaction error:", error);
      throw new Error(
        `Database transaction failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}
