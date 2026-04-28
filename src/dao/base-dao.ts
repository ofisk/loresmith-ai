import type { D1Database } from "@cloudflare/workers-types";

/** D1 sometimes returns a non-JSON body (e.g. "error code: 1031") after long idle in dev; retry with backoff so you never have to restart. */
const D1_TRANSIENT_PATTERNS = [
	"Failed to parse body as JSON",
	"error code: 1031",
	"1031", // alternate format
];

function isTransientD1Error(error: unknown): boolean {
	const msg = error instanceof Error ? error.message : String(error);
	return D1_TRANSIENT_PATTERNS.some((p) => msg.includes(p));
}

const MAX_D1_RETRIES = 8;
const INITIAL_RETRY_DELAY_MS = 400;
const MAX_RETRY_DELAY_MS = 2000;

export interface BaseDAO {
	db: D1Database;
}

export abstract class BaseDAOClass implements BaseDAO {
	constructor(public db: D1Database) {}

	/** Retry D1 ops on transient 1031/parse errors (e.g. after long idle) with backoff so the app recovers without restart. */
	private async withD1Retry<T>(op: () => Promise<T>): Promise<T> {
		let lastError: unknown;
		for (let attempt = 0; attempt <= MAX_D1_RETRIES; attempt++) {
			try {
				return await op();
			} catch (error) {
				lastError = error;
				if (attempt === MAX_D1_RETRIES || !isTransientD1Error(error))
					throw error;
				const delayMs = Math.min(
					INITIAL_RETRY_DELAY_MS * 2 ** attempt,
					MAX_RETRY_DELAY_MS
				);
				await new Promise((r) => setTimeout(r, delayMs));
			}
		}
		throw lastError;
	}

	/** True if the given table exists (for backwards-compatible code when migrations may not have run) */
	protected async hasTable(tableName: string): Promise<boolean> {
		const rows = await this.queryAll<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type='table' AND name=?",
			[tableName]
		);
		return rows.length > 0;
	}

	protected async queryAll<T = unknown>(
		sql: string,
		params: import("@/types/utils").SqlParamsInput = []
	): Promise<T[]> {
		return this.withD1Retry(async () => {
			try {
				const bindParams = params.map((p) => (p === undefined ? null : p));
				const stmt = this.db.prepare(sql);
				const result = await stmt.bind(...bindParams).all<T>();
				return result.results || [];
			} catch (error) {
				throw new Error(
					`Database query failed: ${error instanceof Error ? error.message : "Unknown error"}`
				);
			}
		});
	}

	protected async queryFirst<T = unknown>(
		sql: string,
		params: import("@/types/utils").SqlParamsInput = []
	): Promise<T | null> {
		return this.withD1Retry(async () => {
			try {
				const bindParams = params.map((p) => (p === undefined ? null : p));
				const stmt = this.db.prepare(sql);
				const result = await stmt.bind(...bindParams).first<T>();
				return result;
			} catch (error) {
				throw new Error(
					`Database query failed: ${error instanceof Error ? error.message : "Unknown error"}`
				);
			}
		});
	}

	protected async execute(
		sql: string,
		params: import("@/types/utils").SqlParamsInput = []
	): Promise<void> {
		return this.withD1Retry(async () => {
			try {
				const bindParams = params.map((p) => (p === undefined ? null : p));
				const stmt = this.db.prepare(sql);
				await stmt.bind(...bindParams).run();
			} catch (error) {
				throw new Error(
					`Database execute failed: ${error instanceof Error ? error.message : "Unknown error"}`
				);
			}
		});
	}

	/** Row change count from D1 `meta.changes` (e.g. conditional UPDATE single-flight). */
	protected async executeReturningChanges(
		sql: string,
		params: import("@/types/utils").SqlParamsInput = []
	): Promise<number> {
		return this.withD1Retry(async () => {
			try {
				const bindParams = params.map((p) => (p === undefined ? null : p));
				const stmt = this.db.prepare(sql);
				const result = await stmt.bind(...bindParams).run();
				return Number(result.meta?.changes ?? 0);
			} catch (error) {
				throw new Error(
					`Database execute failed: ${error instanceof Error ? error.message : "Unknown error"}`
				);
			}
		});
	}

	protected async executeAndGetId(
		sql: string,
		params: import("@/types/utils").SqlParamsInput = []
	): Promise<number> {
		return this.withD1Retry(async () => {
			try {
				const bindParams = params.map((p) => (p === undefined ? null : p));
				const stmt = this.db.prepare(sql);
				const result = await stmt.bind(...bindParams).run();
				return result.meta?.last_row_id || 0;
			} catch (error) {
				throw new Error(
					`Database execute failed: ${error instanceof Error ? error.message : "Unknown error"}`
				);
			}
		});
	}

	protected async transaction<T>(
		operations: (() => Promise<T>)[]
	): Promise<T[]> {
		try {
			return await Promise.all(operations.map((op) => op()));
		} catch (error) {
			throw new Error(
				`Database transaction failed: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}
}
