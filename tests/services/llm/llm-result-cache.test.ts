import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmResultCacheDAO } from "../../../src/dao/llm-result-cache-dao";
import type { LlmResultCacheKeyInput } from "../../../src/lib/llm-result-cache-key";
import {
	createLlmResultCacheForDao,
	MAX_CACHEABLE_PAYLOAD_BYTES,
	NOOP_LLM_RESULT_CACHE,
} from "../../../src/services/llm/llm-result-cache";

const KEY: LlmResultCacheKeyInput = {
	kind: "entity_extraction",
	model: "claude-sonnet-5",
	promptPrefix: "Extract entities.",
	variablePart: "A village at the foot of the Grey Spine.",
};

/** In-memory stand-in for the D1-backed DAO. */
function fakeDao(overrides: Partial<LlmResultCacheDAO> = {}) {
	const rows = new Map<
		string,
		{ payload: string; model: string; payload_bytes: number; hit_count: number }
	>();
	const dao = {
		isSchemaReady: vi.fn(async () => true),
		get: vi.fn(async (cacheKey: string) => {
			const row = rows.get(cacheKey);
			return row ? ({ cache_key: cacheKey, ...row } as never) : null;
		}),
		put: vi.fn(
			async (input: { cacheKey: string; model: string; payload: string }) => {
				if (!rows.has(input.cacheKey)) {
					rows.set(input.cacheKey, {
						payload: input.payload,
						model: input.model,
						payload_bytes: input.payload.length,
						hit_count: 0,
					});
				}
			}
		),
		recordHit: vi.fn(async () => {}),
		...overrides,
	} as unknown as LlmResultCacheDAO;
	return { dao, rows };
}

describe("LlmResultCache", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("computes on a miss and serves the stored value on the next call", async () => {
		const { dao } = fakeDao();
		const cache = createLlmResultCacheForDao(dao);
		const compute = vi.fn(async () => ({ npcs: [{ name: "Ilsa Vantry" }] }));

		const first = await cache.getOrCompute(KEY, compute);
		expect(first.cached).toBe(false);
		expect(compute).toHaveBeenCalledTimes(1);

		const second = await cache.getOrCompute(KEY, compute);
		expect(second.cached).toBe(true);
		expect(second.value).toEqual({ npcs: [{ name: "Ilsa Vantry" }] });
		// The point of the whole exercise: no second model call.
		expect(compute).toHaveBeenCalledTimes(1);
	});

	it("does not serve one prompt's result to another", async () => {
		const { dao } = fakeDao();
		const cache = createLlmResultCacheForDao(dao);
		await cache.getOrCompute(KEY, async () => "old");

		const withEditedPrompt = await cache.getOrCompute(
			{ ...KEY, promptPrefix: "Extract entities and factions." },
			async () => "new"
		);
		expect(withEditedPrompt.cached).toBe(false);
		expect(withEditedPrompt.value).toBe("new");
	});

	it("does not cache an undefined result, so a bad model response is retried", async () => {
		const { dao, rows } = fakeDao();
		const cache = createLlmResultCacheForDao(dao);

		await cache.getOrCompute(KEY, async () => undefined);
		expect(rows.size).toBe(0);

		const retried = await cache.getOrCompute(KEY, async () => "recovered");
		expect(retried.cached).toBe(false);
		expect(retried.value).toBe("recovered");
	});

	it("skips storing an oversized payload rather than writing a huge row", async () => {
		const { dao, rows } = fakeDao();
		const cache = createLlmResultCacheForDao(dao);
		const huge = "x".repeat(MAX_CACHEABLE_PAYLOAD_BYTES + 10);

		const result = await cache.getOrCompute(KEY, async () => huge);
		expect(result.value).toBe(huge);
		expect(rows.size).toBe(0);
		expect(dao.put).not.toHaveBeenCalled();
	});

	it("degrades to a plain call when the table has not been migrated yet", async () => {
		const { dao } = fakeDao({
			isSchemaReady: vi.fn(async () => false),
		} as Partial<LlmResultCacheDAO>);
		const cache = createLlmResultCacheForDao(dao);
		const compute = vi.fn(async () => "computed");

		expect((await cache.getOrCompute(KEY, compute)).value).toBe("computed");
		expect((await cache.getOrCompute(KEY, compute)).cached).toBe(false);
		expect(dao.get).not.toHaveBeenCalled();
	});

	it("treats a read failure as a miss instead of failing the pipeline", async () => {
		const { dao } = fakeDao({
			get: vi.fn(async () => {
				throw new Error("D1 unavailable");
			}),
		} as Partial<LlmResultCacheDAO>);
		const cache = createLlmResultCacheForDao(dao);

		const result = await cache.getOrCompute(KEY, async () => "computed");
		expect(result.value).toBe("computed");
		expect(result.cached).toBe(false);
	});

	it("treats a write failure as a miss instead of failing the pipeline", async () => {
		const { dao } = fakeDao({
			put: vi.fn(async () => {
				throw new Error("D1 unavailable");
			}),
		} as Partial<LlmResultCacheDAO>);
		const cache = createLlmResultCacheForDao(dao);

		const result = await cache.getOrCompute(KEY, async () => "computed");
		expect(result.value).toBe("computed");
	});

	it("recomputes when a stored payload no longer parses", async () => {
		const { dao, rows } = fakeDao();
		const cache = createLlmResultCacheForDao(dao);
		await cache.getOrCompute(KEY, async () => ({ ok: true }));
		for (const [key, row] of rows) {
			rows.set(key, { ...row, payload: "{not json" });
		}

		const result = await cache.getOrCompute(KEY, async () => ({ ok: false }));
		expect(result.cached).toBe(false);
		expect(result.value).toEqual({ ok: false });
	});

	it("checks the schema once, not once per chunk", async () => {
		const { dao } = fakeDao();
		const cache = createLlmResultCacheForDao(dao);
		await cache.getOrCompute(KEY, async () => 1);
		await cache.getOrCompute({ ...KEY, variablePart: "other" }, async () => 2);
		await cache.getOrCompute({ ...KEY, variablePart: "third" }, async () => 3);
		expect(dao.isSchemaReady).toHaveBeenCalledTimes(1);
	});
});

describe("NOOP_LLM_RESULT_CACHE", () => {
	it("always computes, so an unwired call site behaves exactly as before", async () => {
		const compute = vi.fn(async () => "value");
		const a = await NOOP_LLM_RESULT_CACHE.getOrCompute(KEY, compute);
		const b = await NOOP_LLM_RESULT_CACHE.getOrCompute(KEY, compute);
		expect(a.cached).toBe(false);
		expect(b.cached).toBe(false);
		expect(compute).toHaveBeenCalledTimes(2);
	});
});
