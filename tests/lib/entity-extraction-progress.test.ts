import { describe, expect, it } from "vitest";
import {
	entityExtractionProgressPercent,
	formatBatchWaitingMarker,
	parseEntityExtractionBatchState,
	parseEntityExtractionProgress,
	queueMessageWithProgress,
} from "@/lib/entity-extraction-progress";

describe("parseEntityExtractionProgress", () => {
	it("parses a bare PROGRESS line", () => {
		expect(parseEntityExtractionProgress("PROGRESS:9/59")).toEqual({
			processed: 9,
			total: 59,
		});
	});

	it("reads the first PROGRESS when prefixed before error text", () => {
		expect(
			parseEntityExtractionProgress(
				"PROGRESS:12/59\n429 Too Many Requests — retry later"
			)
		).toEqual({ processed: 12, total: 59 });
	});

	it("returns null when missing", () => {
		expect(parseEntityExtractionProgress(null)).toBeNull();
		expect(parseEntityExtractionProgress("Rate limited")).toBeNull();
	});

	it("returns null when processed exceeds total (corrupt checkpoint)", () => {
		expect(parseEntityExtractionProgress("PROGRESS:39/10")).toBeNull();
	});
});

describe("entityExtractionProgressPercent", () => {
	it("uses embedded PROGRESS", () => {
		expect(
			entityExtractionProgressPercent("PROGRESS:12/59\nsome trailing detail")
		).toBe(20);
	});
});

describe("queueMessageWithProgress", () => {
	it("prefixes PROGRESS when previous message had it", () => {
		expect(
			queueMessageWithProgress("PROGRESS:12/59", "429 Too Many Requests")
		).toBe("PROGRESS:12/59\n429 Too Many Requests");
	});

	it("extracts PROGRESS from a prior combined message", () => {
		expect(
			queueMessageWithProgress("PROGRESS:12/59\nold error", "new error")
		).toBe("PROGRESS:12/59\nnew error");
	});

	it("returns detail only when no prior PROGRESS", () => {
		expect(queueMessageWithProgress(null, "oops")).toBe("oops");
	});
});

describe("batch marker (issue #735)", () => {
	it("round-trips a batch waiting marker", () => {
		const marker = formatBatchWaitingMarker(8, "2026-07-26T10:00:00.000Z");
		expect(parseEntityExtractionBatchState(marker)).toEqual({
			chunkCount: 8,
			submittedAt: "2026-07-26T10:00:00.000Z",
		});
	});

	it("coexists with a PROGRESS line without breaking either parser", () => {
		const message = queueMessageWithProgress(
			"PROGRESS:4/12",
			formatBatchWaitingMarker(8, "2026-07-26T10:00:00.000Z")
		);
		expect(parseEntityExtractionProgress(message)).toEqual({
			processed: 4,
			total: 12,
		});
		expect(parseEntityExtractionBatchState(message)).toEqual({
			chunkCount: 8,
			submittedAt: "2026-07-26T10:00:00.000Z",
		});
	});

	it("returns null when no batch is in flight", () => {
		expect(parseEntityExtractionBatchState(null)).toBeNull();
		expect(parseEntityExtractionBatchState("PROGRESS:4/12")).toBeNull();
		expect(parseEntityExtractionBatchState("BATCH:0:now")).toBeNull();
	});
});
