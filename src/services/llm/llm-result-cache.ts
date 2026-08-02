/**
 * Content-addressed cache for expensive LLM results (issue #761, finding 8).
 *
 * `CommunitySummaryService.generateOrGetSummary` already checks for an existing
 * result before calling a model. That is the pattern; it just was not applied
 * anywhere else. Re-uploading the same PDF, or re-running a rebuild over
 * unchanged chunks, re-paid full extraction cost on Sonnet 5 every time.
 *
 * Three properties matter more than the storage details:
 *
 * 1. **The key covers the rendered prompt, not a version constant.** An
 *    instruction edit and a content edit invalidate the same way, so there is
 *    no version number to forget. See `lib/llm-result-cache-key`.
 * 2. **The payload is campaign-independent.** For extraction the cached value
 *    is the validated model output, captured *before* entity IDs are minted and
 *    scoped to a campaign. The same document added to a second campaign is
 *    therefore a hit, which is where re-index savings actually live.
 * 3. **Every failure is a miss.** Missing table, missing binding, unparseable
 *    row, D1 error — all of them fall through to the model. A cache that can
 *    break a pipeline is not worth having, and `main` deploys the Worker
 *    automatically while D1 migrations are applied separately, so the
 *    table-not-yet-there window is real.
 */

import { getDAOFactory } from "@/dao/dao-factory";
import type { LlmResultCacheDAO } from "@/dao/llm-result-cache-dao";
import type { EnvWithSecrets } from "@/lib/env-utils";
import { getEnvVar } from "@/lib/env-utils";
import {
	buildLlmResultCacheKey,
	type LlmResultCacheKeyInput,
	type LlmResultCacheKind,
} from "@/lib/llm-result-cache-key";
import { isVerboseLlmSpendEnabled } from "@/lib/llm-usage-verbose-log";
import { createLogger } from "@/lib/logger";

/**
 * Payloads above this are not stored.
 *
 * D1 permits far larger rows, but a payload this size is an extraction that
 * returned an unusual amount of output, and caching it trades a large write on
 * every miss for a saving on a repeat that may never come. Skipping is silent
 * on the read path — an oversized result is simply always recomputed.
 */
export const MAX_CACHEABLE_PAYLOAD_BYTES = 512 * 1024;

export interface LlmResultCacheLookup<T> {
	value: T;
	/** True when the value came from the cache and no model call happened. */
	cached: boolean;
}

/**
 * The surface call sites depend on. Narrow on purpose: services take this
 * rather than a DAO or an `Env` so a unit test can pass a stub without a D1
 * binding, and so a call site cannot reach past it into the table.
 */
export interface LlmResultCache {
	getOrCompute<T>(
		input: LlmResultCacheKeyInput,
		compute: () => Promise<T>
	): Promise<LlmResultCacheLookup<T>>;
}

/** A cache that never hits. Used when the flag is off or there is no DB binding. */
export const NOOP_LLM_RESULT_CACHE: LlmResultCache = {
	async getOrCompute(_input, compute) {
		return { value: await compute(), cached: false };
	},
};

interface D1LlmResultCacheOptions {
	dao: LlmResultCacheDAO;
	env?: EnvWithSecrets | Record<string, unknown>;
}

class D1LlmResultCache implements LlmResultCache {
	private readonly dao: LlmResultCacheDAO;
	private readonly env?: EnvWithSecrets | Record<string, unknown>;
	/** Resolved once per instance: `sqlite_master` should not be queried per chunk. */
	private schemaReady: Promise<boolean> | null = null;

	constructor(options: D1LlmResultCacheOptions) {
		this.dao = options.dao;
		this.env = options.env;
	}

	async getOrCompute<T>(
		input: LlmResultCacheKeyInput,
		compute: () => Promise<T>
	): Promise<LlmResultCacheLookup<T>> {
		if (!(await this.isReady())) {
			return { value: await compute(), cached: false };
		}

		let cacheKey: string;
		try {
			({ cacheKey } = await buildLlmResultCacheKey(input));
		} catch {
			return { value: await compute(), cached: false };
		}

		const hit = await this.read<T>(cacheKey, input.kind);
		if (hit !== undefined) {
			return { value: hit, cached: true };
		}

		const value = await compute();
		await this.write(cacheKey, input, value);
		return { value, cached: false };
	}

	private async isReady(): Promise<boolean> {
		if (!this.schemaReady) {
			this.schemaReady = this.dao.isSchemaReady().catch(() => false);
		}
		return this.schemaReady;
	}

	/** `undefined` means miss; a stored `null` payload is a legitimate hit. */
	private async read<T>(
		cacheKey: string,
		kind: LlmResultCacheKind
	): Promise<T | undefined> {
		try {
			const row = await this.dao.get(cacheKey);
			if (!row) {
				this.log("llm_result_cache_miss", { kind, cacheKey });
				return undefined;
			}
			const value = JSON.parse(row.payload) as T;
			// Accounting only; a failed increment must not turn a hit into a miss.
			this.dao.recordHit(cacheKey).catch(() => {});
			this.log("llm_result_cache_hit", {
				kind,
				cacheKey,
				model: row.model,
				payloadBytes: row.payload_bytes,
				priorHits: row.hit_count,
			});
			return value;
		} catch {
			// Includes a row whose payload no longer parses, e.g. written by an
			// older shape. Recomputing is always correct; serving garbage is not.
			return undefined;
		}
	}

	private async write<T>(
		cacheKey: string,
		input: LlmResultCacheKeyInput,
		value: T
	): Promise<void> {
		try {
			if (value === undefined) {
				return;
			}
			const payload = JSON.stringify(value);
			if (payload.length > MAX_CACHEABLE_PAYLOAD_BYTES) {
				this.log("llm_result_cache_payload_too_large", {
					kind: input.kind,
					payloadBytes: payload.length,
					limitBytes: MAX_CACHEABLE_PAYLOAD_BYTES,
				});
				return;
			}
			await this.dao.put({
				cacheKey,
				kind: input.kind,
				model: input.model,
				payload,
			});
		} catch {
			// A cache that fails a write must not fail the extraction that produced it.
		}
	}

	private log(event: string, fields: Record<string, unknown>): void {
		if (!isVerboseLlmSpendEnabled(this.env)) {
			return;
		}
		try {
			createLogger(
				this.env as Record<string, unknown> | undefined,
				"[LlmResultCache]"
			).info(event, { event, ...fields });
		} catch {
			// Logging is best-effort.
		}
	}
}

/**
 * Build a cache over an already-resolved DAO.
 *
 * The seam {@link createLlmResultCache} uses, and the one tests use to exercise
 * hit/miss/degradation behaviour without a D1 binding.
 */
export function createLlmResultCacheForDao(
	dao: LlmResultCacheDAO,
	env?: EnvWithSecrets | Record<string, unknown>
): LlmResultCache {
	return new D1LlmResultCache({ dao, env });
}

/**
 * Off only by explicit opt-out. Unlike the chunk gate this changes no model
 * output — a hit returns a payload an identical call already produced — so the
 * conservative default is "on", with a switch for turning it off during an
 * incident without a deploy.
 */
export async function isLlmResultCacheEnabled(
	env: EnvWithSecrets | Record<string, unknown> | undefined
): Promise<boolean> {
	if (!env) {
		return false;
	}
	try {
		const raw = await getEnvVar(
			env as EnvWithSecrets,
			"LLM_RESULT_CACHE_ENABLED",
			false
		);
		const v = raw.trim().toLowerCase();
		if (v === "") {
			return true;
		}
		return !(v === "0" || v === "false" || v === "no" || v === "off");
	} catch {
		return true;
	}
}

/**
 * Build the cache for a worker env, or the no-op cache when it cannot be used.
 *
 * Never throws: a caller that cannot get a real cache gets one that always
 * misses, so wiring this into a pipeline can only cost a model call it would
 * have made anyway.
 */
export async function createLlmResultCache(
	env: EnvWithSecrets | Record<string, unknown> | undefined
): Promise<LlmResultCache> {
	if (!(await isLlmResultCacheEnabled(env))) {
		return NOOP_LLM_RESULT_CACHE;
	}
	try {
		return createLlmResultCacheForDao(
			getDAOFactory(env).llmResultCacheDAO,
			env
		);
	} catch {
		// No DB binding (unit tests, some queue contexts): degrade to no cache.
		return NOOP_LLM_RESULT_CACHE;
	}
}
