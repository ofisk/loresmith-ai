import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	D1_IN_LIST_CHUNK_SIZE,
	D1_MAX_BOUND_PARAMETERS_PER_QUERY,
} from "@/dao/d1-limits";
import { FileProcessingChunksDAO } from "@/dao/file/file-processing-chunks-dao";

interface RecordedCall {
	sql: string;
	params: unknown[];
}

/**
 * D1 mock that records every statement and the parameters bound to it, so a
 * test can assert on the shape of the batching rather than only its results.
 */
function createRecordingDB(rowsFor: (params: unknown[]) => unknown[]) {
	const calls: RecordedCall[] = [];
	const db = {
		prepare: vi.fn((sql: string) => {
			const call: RecordedCall = { sql, params: [] };
			const stmt = {
				bind: vi.fn((...params: unknown[]) => {
					call.params = params;
					calls.push(call);
					return stmt;
				}),
				all: vi.fn(async () => ({ results: rowsFor(call.params) })),
				first: vi.fn(async () => null),
				run: vi.fn(async () => ({ meta: { changes: 0 } })),
			};
			return stmt;
		}),
	} as unknown as D1Database;
	return { db, calls };
}

const statsRow = (fileKey: unknown) => ({
	file_key: fileKey,
	total: 4,
	completed: 3,
	failed: 0,
	pending: 1,
	processing: 0,
});

describe("FileProcessingChunksDAO.getFileChunkStatsForFileKeys", () => {
	let dao: FileProcessingChunksDAO;
	let calls: RecordedCall[];

	beforeEach(() => {
		const recording = createRecordingDB((params) => params.map(statsRow));
		calls = recording.calls;
		dao = new FileProcessingChunksDAO(recording.db);
	});

	it("issues no query for an empty key list", async () => {
		const stats = await dao.getFileChunkStatsForFileKeys([]);
		expect(stats.size).toBe(0);
		expect(calls).toHaveLength(0);
	});

	it("sends a single query when the library fits in one batch", async () => {
		const keys = ["a", "b", "c"];
		const stats = await dao.getFileChunkStatsForFileKeys(keys);

		expect(calls).toHaveLength(1);
		expect(calls[0].params).toEqual(keys);
		expect(stats.get("b")).toEqual({
			total: 4,
			completed: 3,
			failed: 0,
			pending: 1,
			processing: 0,
		});
	});

	it("never exceeds D1's bound-parameter ceiling for a large library", async () => {
		// Regression: GET /library/files bound one placeholder per file, so a user
		// with more than ~100 files got `D1_ERROR: too many SQL variables` and the
		// whole route 500'd.
		const keys = Array.from({ length: 250 }, (_, i) => `file-${i}`);

		await dao.getFileChunkStatsForFileKeys(keys);

		expect(calls.length).toBeGreaterThan(1);
		for (const call of calls) {
			expect(call.params.length).toBeLessThanOrEqual(
				D1_MAX_BOUND_PARAMETERS_PER_QUERY
			);
			// Placeholder count must match the params actually bound.
			expect(call.sql.match(/\?/g) ?? []).toHaveLength(call.params.length);
		}
		expect(calls).toHaveLength(Math.ceil(keys.length / D1_IN_LIST_CHUNK_SIZE));
	});

	it("returns stats for every file across batch boundaries", async () => {
		const keys = Array.from({ length: 250 }, (_, i) => `file-${i}`);

		const stats = await dao.getFileChunkStatsForFileKeys(keys);

		expect(stats.size).toBe(keys.length);
		// Every key is queried exactly once, in order, with none dropped.
		expect(calls.flatMap((c) => c.params)).toEqual(keys);
	});

	it("defaults missing aggregate columns to zero", async () => {
		const recording = createRecordingDB(() => [{ file_key: "a" }]);
		dao = new FileProcessingChunksDAO(recording.db);

		const stats = await dao.getFileChunkStatsForFileKeys(["a"]);

		expect(stats.get("a")).toEqual({
			total: 0,
			completed: 0,
			failed: 0,
			pending: 0,
			processing: 0,
		});
	});
});
