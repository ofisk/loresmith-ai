import { describe, expect, it } from "vitest";
import {
	bumpCount,
	getDifficultySlots,
	getEntityText,
	inferThreatBand,
	parseNumericChallenge,
} from "@/tools/campaign-context/encounter-difficulty-utils";
import { makeEntity } from "../factories";

describe("encounter difficulty utils", () => {
	describe("getEntityText", () => {
		it("returns empty string for invalid content", () => {
			expect(getEntityText(makeEntity({ content: undefined }))).toBe("");
			expect(getEntityText(makeEntity({ content: null }))).toBe("");
			expect(getEntityText(makeEntity({ content: [] }))).toBe("");
		});

		it("returns JSON string for valid object content", () => {
			const entity = makeEntity({
				content: { cr: 5, name: "Goblin" },
				entityType: "monsters",
			});
			expect(getEntityText(entity)).toBe('{"cr":5,"name":"Goblin"}');
		});

		it("returns empty string when JSON.stringify throws", () => {
			const circular: Record<string, unknown> = {};
			circular.self = circular;
			const entity = makeEntity({
				content: circular,
				entityType: "monsters",
			});
			expect(getEntityText(entity)).toBe("");
		});
	});

	describe("parseNumericChallenge", () => {
		it("parses cr from entity content", () => {
			const entity = makeEntity({
				content: { cr: 5 },
				entityType: "monsters",
			});
			expect(parseNumericChallenge(entity)).toBe(5);
		});

		it("parses challengeRating from entity content", () => {
			const entity = makeEntity({
				content: { challengeRating: 3 },
				entityType: "monsters",
			});
			expect(parseNumericChallenge(entity)).toBe(3);
		});

		it("parses challenge_rating from entity content", () => {
			const entity = makeEntity({
				content: { challenge_rating: 8 },
				entityType: "monsters",
			});
			expect(parseNumericChallenge(entity)).toBe(8);
		});

		it("parses fraction string like 1/2", () => {
			const entity = makeEntity({
				content: { challengeRating: "1/2" },
				entityType: "monsters",
			});
			expect(parseNumericChallenge(entity)).toBe(0.5);
		});

		it("parses level from entity content", () => {
			const entity = makeEntity({
				content: { level: 3 },
				entityType: "monsters",
			});
			expect(parseNumericChallenge(entity)).toBe(3);
		});

		it("returns null for missing or invalid content", () => {
			expect(parseNumericChallenge(makeEntity({ content: undefined }))).toBe(
				null
			);
			expect(parseNumericChallenge(makeEntity({ content: {} }))).toBe(null);
			expect(
				parseNumericChallenge(makeEntity({ content: { cr: "invalid" } }))
			).toBe(null);
		});
	});

	describe("inferThreatBand", () => {
		it("returns low for CR ≤ 2", () => {
			expect(
				inferThreatBand(
					makeEntity({ content: { cr: 1 }, entityType: "monsters" })
				)
			).toBe("low");
			expect(
				inferThreatBand(
					makeEntity({ content: { cr: 2 }, entityType: "monsters" })
				)
			).toBe("low");
			expect(
				inferThreatBand(
					makeEntity({
						content: { challengeRating: "1/2" },
						entityType: "monsters",
					})
				)
			).toBe("low");
		});

		it("returns standard for CR 3–7", () => {
			expect(
				inferThreatBand(
					makeEntity({ content: { cr: 3 }, entityType: "monsters" })
				)
			).toBe("standard");
			expect(
				inferThreatBand(
					makeEntity({ content: { cr: 5 }, entityType: "monsters" })
				)
			).toBe("standard");
			expect(
				inferThreatBand(
					makeEntity({ content: { cr: 7 }, entityType: "monsters" })
				)
			).toBe("standard");
		});

		it("returns high for CR ≥ 8", () => {
			expect(
				inferThreatBand(
					makeEntity({ content: { cr: 8 }, entityType: "monsters" })
				)
			).toBe("high");
			expect(
				inferThreatBand(
					makeEntity({ content: { cr: 15 }, entityType: "monsters" })
				)
			).toBe("high");
		});

		it("infers high from name keywords when CR missing", () => {
			expect(
				inferThreatBand(
					makeEntity({ name: "Ancient Red Dragon", entityType: "monsters" })
				)
			).toBe("high");
			expect(
				inferThreatBand(
					makeEntity({ name: "Boss Warlord", entityType: "monsters" })
				)
			).toBe("high");
		});

		it("infers low from name keywords when CR missing", () => {
			expect(
				inferThreatBand(
					makeEntity({ name: "Young Wolf", entityType: "monsters" })
				)
			).toBe("low");
			expect(
				inferThreatBand(
					makeEntity({ name: "Cultist Minion", entityType: "monsters" })
				)
			).toBe("low");
		});

		it("defaults to standard when no CR or keywords", () => {
			expect(
				inferThreatBand(
					makeEntity({ name: "Generic Monster", entityType: "monsters" })
				)
			).toBe("standard");
		});
	});

	describe("getDifficultySlots", () => {
		it("returns correct slots for easy difficulty", () => {
			expect(getDifficultySlots("easy", 1)).toEqual({
				low: 1,
				standard: 1,
				high: 0,
			});
			expect(getDifficultySlots("easy", 4)).toEqual({
				low: 3,
				standard: 1,
				high: 0,
			});
			expect(getDifficultySlots("easy", 6)).toEqual({
				low: 5,
				standard: 1,
				high: 0,
			});
		});

		it("returns correct slots for medium difficulty", () => {
			expect(getDifficultySlots("medium", 1)).toEqual({
				low: 1,
				standard: 1,
				high: 0,
			});
			expect(getDifficultySlots("medium", 4)).toEqual({
				low: 4,
				standard: 1,
				high: 0,
			});
			expect(getDifficultySlots("medium", 6)).toEqual({
				low: 6,
				standard: 1,
				high: 0,
			});
		});

		it("returns correct slots for hard difficulty", () => {
			expect(getDifficultySlots("hard", 4)).toEqual({
				low: 4,
				standard: 2,
				high: 0,
			});
			expect(getDifficultySlots("hard", 6)).toEqual({
				low: 6,
				standard: 2,
				high: 0,
			});
		});

		it("returns correct slots for deadly difficulty", () => {
			expect(getDifficultySlots("deadly", 4)).toEqual({
				low: 4,
				standard: 2,
				high: 1,
			});
			expect(getDifficultySlots("deadly", 6)).toEqual({
				low: 6,
				standard: 2,
				high: 1,
			});
		});

		it("returns default slots for unknown difficulty", () => {
			expect(getDifficultySlots("unknown" as any, 4)).toEqual({
				low: 4,
				standard: 1,
				high: 0,
			});
		});
	});

	describe("bumpCount", () => {
		it("returns base when steps is 0", () => {
			expect(bumpCount(2, 0)).toBe(2);
			expect(bumpCount(4, 0)).toBe(4);
		});

		it("increases count for positive steps", () => {
			expect(bumpCount(2, 2)).toBeGreaterThan(2);
			expect(bumpCount(2, 1)).toBe(3); // next <= 2 adds 1
		});

		it("decreases count for negative steps", () => {
			expect(bumpCount(4, -1)).toBeLessThan(4);
			expect(bumpCount(4, -1)).toBeGreaterThanOrEqual(1);
		});

		it("never returns less than 1", () => {
			expect(bumpCount(1, -5)).toBe(1);
		});
	});
});
