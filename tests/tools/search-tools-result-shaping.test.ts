import { describe, expect, it } from "vitest";
import {
	applyResultLimit,
	buildSearchSummary,
	filterToStrongNameMatches,
	hasSemanticRelevanceScores,
	sortByRelevance,
} from "@/tools/campaign-context/search-tools-result-shaping";

describe("hasSemanticRelevanceScores", () => {
	it("treats the fixed non-semantic scores as absent", () => {
		const results = [{ score: 0.8 }, { score: 0.7 }, { score: 1.0 }, {}];
		expect(hasSemanticRelevanceScores(results)).toBe(false);
	});

	it("detects a computed relevance score", () => {
		expect(hasSemanticRelevanceScores([{ score: 0.8 }, { score: 0.42 }])).toBe(
			true
		);
	});
});

describe("filterToStrongNameMatches", () => {
	const results = [{ entityId: "a" }, { entityId: "b" }];
	const similarityScores = new Map([
		["a", 0.9],
		["b", 0.2],
	]);

	it("narrows to entities above the threshold", () => {
		expect(
			filterToStrongNameMatches(results, {
				forSessionReadout: false,
				hasStrongNameMatches: true,
				similarityScores,
				threshold: 0.6,
			})
		).toEqual([{ entityId: "a" }]);
	});

	it("keeps every result for session readouts", () => {
		expect(
			filterToStrongNameMatches(results, {
				forSessionReadout: true,
				hasStrongNameMatches: true,
				similarityScores,
				threshold: 0.6,
			})
		).toBe(results);
	});

	it("falls back to all results when nothing clears the threshold", () => {
		expect(
			filterToStrongNameMatches(results, {
				forSessionReadout: false,
				hasStrongNameMatches: true,
				similarityScores,
				threshold: 0.95,
			})
		).toBe(results);
	});
});

describe("sortByRelevance", () => {
	it("orders by score when semantic scores exist", () => {
		const results = [
			{ title: "a", score: 0.2 },
			{ title: "b", score: 0.9 },
		];
		expect(sortByRelevance(results, true).map((r) => r.title)).toEqual([
			"b",
			"a",
		]);
	});

	it("orders alphabetically without semantic scores", () => {
		const results = [
			{ title: "Zephyr", score: 0.8 },
			{ title: "Alder", score: 0.8 },
		];
		expect(sortByRelevance(results, false).map((r) => r.title)).toEqual([
			"Alder",
			"Zephyr",
		]);
	});
});

describe("applyResultLimit", () => {
	it("flags more results and truncates to the limit", () => {
		const { pageResults, hasMore } = applyResultLimit([1, 2, 3] as any, 2);
		expect(pageResults).toHaveLength(2);
		expect(hasMore).toBe(true);
	});

	it("returns everything when under the limit", () => {
		expect(applyResultLimit([1, 2] as any, 5).hasMore).toBe(false);
	});
});

describe("buildSearchSummary", () => {
	const base = {
		query: "dragons",
		isListAll: false,
		hasSemanticScores: true,
		forSessionReadout: false,
		hasMore: false,
		totalCount: undefined as number | undefined,
		shownCount: 3,
		matchedCount: 3,
		offset: 0,
		effectiveLimit: 15,
	};

	it("reports the shown count and relevance sorting", () => {
		expect(buildSearchSummary(base)).toBe(
			'Found 3 results for "dragons". Results are sorted from most to least relevant.'
		);
	});

	it("labels the entity type and alphabetical sorting", () => {
		const summary = buildSearchSummary({
			...base,
			entityType: "monsters",
			hasSemanticScores: false,
		});
		expect(summary).toContain("(monsters)");
		expect(summary).toContain("sorted alphabetically by name");
	});

	it("advertises the next offset when truncated with a known total", () => {
		const summary = buildSearchSummary({
			...base,
			hasMore: true,
			totalCount: 40,
			shownCount: 15,
		});
		expect(summary).toContain("Showing 15 of 40 total results");
		expect(summary).toContain("offset=15");
	});

	it("uses shard wording for list-all queries", () => {
		const summary = buildSearchSummary({
			...base,
			isListAll: true,
			hasMore: true,
			totalCount: 700,
			shownCount: 500,
		});
		expect(summary).toContain("total shards");
	});

	it("appends the readout reminder", () => {
		expect(buildSearchSummary({ ...base, forSessionReadout: true })).toContain(
			"do not summarize"
		);
	});
});
