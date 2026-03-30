import { describe, expect, it } from "vitest";
import {
	D1_IN_LIST_CHUNK_SIZE,
	D1_MAX_BOUND_PARAMETERS_PER_QUERY,
	d1MultiRowValuesChunkSize,
} from "@/dao/d1-limits";

describe("d1-limits", () => {
	it("documents D1 max binds and safe IN chunk", () => {
		expect(D1_MAX_BOUND_PARAMETERS_PER_QUERY).toBe(100);
		expect(D1_IN_LIST_CHUNK_SIZE).toBeLessThanOrEqual(100);
	});

	it("sizes multi-row VALUES chunks for two columns under D1 cap", () => {
		expect(d1MultiRowValuesChunkSize(2)).toBe(49);
	});
});
