import type { D1Database } from "@cloudflare/workers-types";

/**
 * Database utilities for common operations and error handling
 *
 * This module provides reusable database operations with consistent
 * error handling, connection management, and result processing.
 */
export class DatabaseUtils {
  constructor(private db: D1Database) {}

  /**
   * Execute a query with error handling
   */
  async executeQuery<T = any>(
    query: string,
    params: any[] = []
  ): Promise<{ results: T[]; success: boolean; error?: string }> {
    try {
      const { results } = await this.db
        .prepare(query)
        .bind(...params)
        .all();
      return { results: results as T[], success: true };
    } catch (error) {
      console.error("[DatabaseUtils] Query execution failed:", error);
      return {
        results: [],
        success: false,
        error: error instanceof Error ? error.message : "Database error",
      };
    }
  }

  /**
   * Execute a single row query
   */
  async executeSingleQuery<T = any>(
    query: string,
    params: any[] = []
  ): Promise<{ result: T | null; success: boolean; error?: string }> {
    try {
      const result = await this.db
        .prepare(query)
        .bind(...params)
        .first();
      return { result: result as T, success: true };
    } catch (error) {
      console.error("[DatabaseUtils] Single query execution failed:", error);
      return {
        result: null,
        success: false,
        error: error instanceof Error ? error.message : "Database error",
      };
    }
  }

  /**
   * Execute an insert/update/delete operation
   */
  async executeMutation(
    query: string,
    params: any[] = []
  ): Promise<{ success: boolean; error?: string; affectedRows?: number }> {
    try {
      const result = await this.db
        .prepare(query)
        .bind(...params)
        .run();
      return {
        success: true,
        affectedRows: result.meta?.changes || 0,
      };
    } catch (error) {
      console.error("[DatabaseUtils] Mutation execution failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Database error",
      };
    }
  }

  /**
   * Execute a transaction with multiple operations
   */
  async executeTransaction<T = any>(
    operations: Array<{
      query: string;
      params: any[];
      type: "query" | "mutation";
    }>
  ): Promise<{ results: T[]; success: boolean; error?: string }> {
    try {
      const results: T[] = [];

      for (const operation of operations) {
        if (operation.type === "query") {
          const {
            results: queryResults,
            success,
            error,
          } = await this.executeQuery<T>(operation.query, operation.params);

          if (!success) {
            throw new Error(error || "Transaction failed");
          }

          results.push(...queryResults);
        } else {
          const { success, error } = await this.executeMutation(
            operation.query,
            operation.params
          );

          if (!success) {
            throw new Error(error || "Transaction failed");
          }
        }
      }

      return { results, success: true };
    } catch (error) {
      console.error("[DatabaseUtils] Transaction failed:", error);
      return {
        results: [],
        success: false,
        error: error instanceof Error ? error.message : "Transaction error",
      };
    }
  }

  /**
   * Check if a record exists
   */
  async recordExists(
    table: string,
    conditions: Record<string, any>
  ): Promise<boolean> {
    const whereClause = Object.keys(conditions)
      .map((key) => `${key} = ?`)
      .join(" AND ");
    const params = Object.values(conditions);

    const query = `SELECT 1 FROM ${table} WHERE ${whereClause} LIMIT 1`;
    const { result } = await this.executeSingleQuery(query, params);

    return result !== null;
  }

  /**
   * Get count of records
   */
  async getCount(
    table: string,
    conditions: Record<string, any> = {}
  ): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM ${table}`;
    const params: any[] = [];

    if (Object.keys(conditions).length > 0) {
      const whereClause = Object.keys(conditions)
        .map((key) => `${key} = ?`)
        .join(" AND ");
      query += ` WHERE ${whereClause}`;
      params.push(...Object.values(conditions));
    }

    const { result } = await this.executeSingleQuery<{ count: number }>(
      query,
      params
    );
    return result?.count || 0;
  }

  /**
   * Insert a record and return the inserted ID
   */
  async insertRecord(
    table: string,
    data: Record<string, any>
  ): Promise<{ id?: string; success: boolean; error?: string }> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => "?").join(", ");

    const query = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
    const { success, error } = await this.executeMutation(query, values);

    if (success) {
      // Get the last inserted ID
      const { result } = await this.executeSingleQuery<{ id: string }>(
        "SELECT last_insert_rowid() as id"
      );
      return { id: result?.id, success: true };
    }

    return { success: false, error };
  }

  /**
   * Update a record
   */
  async updateRecord(
    table: string,
    data: Record<string, any>,
    conditions: Record<string, any>
  ): Promise<{ success: boolean; error?: string; affectedRows?: number }> {
    const setClause = Object.keys(data)
      .map((key) => `${key} = ?`)
      .join(", ");
    const whereClause = Object.keys(conditions)
      .map((key) => `${key} = ?`)
      .join(" AND ");

    const query = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
    const params = [...Object.values(data), ...Object.values(conditions)];

    return await this.executeMutation(query, params);
  }

  /**
   * Upsert a record using SQLite's INSERT OR REPLACE
   * Efficient single-operation upsert with optional operation tracking
   */
  async upsertRecord(
    table: string,
    data: Record<string, any>,
    options: {
      trackOperation?: boolean;
      uniqueColumns?: string[];
    } = {}
  ): Promise<{
    id?: string;
    success: boolean;
    error?: string;
    operation?: "insert" | "update";
  }> {
    const { trackOperation = false, uniqueColumns = [] } = options;

    try {
      // If tracking operation type, check existence first
      if (trackOperation && uniqueColumns.length > 0) {
        const uniqueData = uniqueColumns.reduce(
          (acc, col) => {
            if (data[col] !== undefined) {
              acc[col] = data[col];
            }
            return acc;
          },
          {} as Record<string, any>
        );

        if (Object.keys(uniqueData).length > 0) {
          const exists = await this.recordExists(table, uniqueData);
          if (exists) {
            // Update existing record
            const { success, error } = await this.updateRecord(
              table,
              data,
              uniqueData
            );
            return {
              success,
              error,
              operation: "update" as const,
            };
          }
        }
      }

      // Perform upsert
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = columns.map(() => "?").join(", ");

      const query = `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
      const { success, error } = await this.executeMutation(query, values);

      if (success) {
        // Get the last inserted ID
        const { result } = await this.executeSingleQuery<{ id: string }>(
          "SELECT last_insert_rowid() as id"
        );
        return {
          id: result?.id,
          success: true,
          operation: trackOperation ? ("insert" as const) : undefined,
        };
      }

      return {
        success: false,
        error,
        operation: trackOperation ? ("insert" as const) : undefined,
      };
    } catch (error) {
      console.error("Error in upsertRecord:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        operation: trackOperation ? ("insert" as const) : undefined,
      };
    }
  }

  /**
   * Delete a record
   */
  async deleteRecord(
    table: string,
    conditions: Record<string, any>
  ): Promise<{ success: boolean; error?: string; affectedRows?: number }> {
    const whereClause = Object.keys(conditions)
      .map((key) => `${key} = ?`)
      .join(" AND ");
    const params = Object.values(conditions);

    const query = `DELETE FROM ${table} WHERE ${whereClause}`;
    return await this.executeMutation(query, params);
  }

  /**
   * Build a WHERE clause from conditions
   */
  buildWhereClause(conditions: Record<string, any>): {
    clause: string;
    params: any[];
  } {
    if (Object.keys(conditions).length === 0) {
      return { clause: "", params: [] };
    }

    const clauses = Object.keys(conditions).map((key) => `${key} = ?`);
    const params = Object.values(conditions);

    return {
      clause: `WHERE ${clauses.join(" AND ")}`,
      params,
    };
  }

  /**
   * Build an ORDER BY clause
   */
  buildOrderClause(orderBy?: {
    column: string;
    direction: "ASC" | "DESC";
  }): string {
    if (!orderBy) return "";
    return `ORDER BY ${orderBy.column} ${orderBy.direction}`;
  }

  /**
   * Build a LIMIT clause
   */
  buildLimitClause(limit?: number, offset?: number): string {
    if (!limit) return "";
    return offset ? `LIMIT ${limit} OFFSET ${offset}` : `LIMIT ${limit}`;
  }
}
