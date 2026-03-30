import { describe, expect, it } from "vitest";
import {
	entityExtractionProgressPercent,
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
