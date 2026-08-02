import { BaseDAOClass } from "@/dao/base-dao";
import type { LlmResultCacheKind } from "@/lib/llm-result-cache-key";

export interface LlmResultCacheRow {
	cache_key: string;
	kind: string;
	model: string;
	payload: string;
	payload_bytes: number;
	hit_count: number;
	created_at: string;
	last_hit_at: string | null;
}

export interface PutLlmResultCacheInput {
	cacheKey: string;
	kind: LlmResultCacheKind;
	model: string;
	/** Already-serialized JSON payload. */
	payload: string;
}

/** Rows older than this are swept by the fast cron. */
export const LLM_RESULT_CACHE_RETENTION_DAYS = 90;

/**
 * Persistence for the content-addressed LLM result cache (issue #761, finding 8).
 *
 * Every method degrades to "cache miss" when the table is absent, so a Worker
 * deployed ahead of its migration pays full model cost rather than throwing on
 * every extraction. Merging to `main` deploys the Worker automatically but does
 * not apply D1 migrations, so that window is real, not hypothetical.
 */
export class LlmResultCacheDAO extends BaseDAOClass {
	async isSchemaReady(): Promise<boolean> {
		return this.hasTable("llm_result_cache");
	}

	/**
	 * Fetch a cached payload. Returns the raw JSON string; deserialization and
	 * schema validation belong to the caller, which owns the shape.
	 */
	async get(cacheKey: string): Promise<LlmResultCacheRow | null> {
		return this.queryFirst<LlmResultCacheRow>(
			`SELECT * FROM llm_result_cache WHERE cache_key = ?`,
			[cacheKey]
		);
	}

	/**
	 * Store a payload, ignoring one that is already there.
	 *
	 * `INSERT OR IGNORE` rather than an upsert: two concurrent extractions of the
	 * same chunk produce interchangeable payloads, so the first to land is as good
	 * as the second and overwriting would only churn the row.
	 */
	async put(input: PutLlmResultCacheInput): Promise<void> {
		await this.execute(
			`INSERT OR IGNORE INTO llm_result_cache (
        cache_key, kind, model, payload, payload_bytes, hit_count, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`,
			[
				input.cacheKey,
				input.kind,
				input.model,
				input.payload,
				input.payload.length,
			]
		);
	}

	/**
	 * Record that a row was served. Best-effort accounting for the savings
	 * report — never on the critical path of returning the payload.
	 */
	async recordHit(cacheKey: string): Promise<void> {
		await this.execute(
			`UPDATE llm_result_cache
         SET hit_count = hit_count + 1, last_hit_at = datetime('now')
       WHERE cache_key = ?`,
			[cacheKey]
		);
	}

	/** Age-based eviction, run from the fast cron alongside the usage-log prunes. */
	async pruneOldRows(
		retentionDays: number = LLM_RESULT_CACHE_RETENTION_DAYS
	): Promise<number> {
		if (!(await this.isSchemaReady())) {
			return 0;
		}
		const result = await this.db
			.prepare(
				`DELETE FROM llm_result_cache WHERE created_at < datetime('now', ?)`
			)
			.bind(`-${retentionDays} days`)
			.run();
		return result.meta?.changes ?? 0;
	}
}
