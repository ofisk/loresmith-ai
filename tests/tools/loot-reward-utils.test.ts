import { describe, expect, it } from "vitest";
import {
	isNoOutputError,
	normalizeCurrency,
	normalizeLootItem,
} from "@/tools/campaign-context/loot-reward-utils";

describe("loot-reward-utils", () => {
	describe("normalizeLootItem", () => {
		it("handles valid object", () => {
			const raw = {
				name: "Sword",
				itemType: "weapon",
				rarity: "rare",
				description: "A magical blade",
			};
			const result = normalizeLootItem(raw) as Record<string, unknown>;
			expect(result.name).toBe("Sword");
			expect(result.itemType).toBe("weapon");
			expect(result.rarity).toBe("rare");
			expect(result.description).toBe("A magical blade");
		});

		it("maps snake_case to camelCase", () => {
			const raw = {
				item_type: "armor",
				mechanical_notes: "AC +2",
				story_hook: "From the dragon hoard",
				estimated_value: 500,
				value_unit: "gp",
			};
			const result = normalizeLootItem(raw) as Record<string, unknown>;
			expect(result.itemType).toBe("armor");
			expect(result.mechanicalNotes).toBe("AC +2");
			expect(result.storyHook).toBe("From the dragon hoard");
			expect(result.estimatedValue).toBe(500);
			expect(result.valueUnit).toBe("gp");
		});

		it("returns input for non-object", () => {
			expect(normalizeLootItem(null)).toBe(null);
			expect(normalizeLootItem("string")).toBe("string");
		});
	});

	describe("normalizeCurrency", () => {
		it("extracts numeric amounts by unit", () => {
			const raw = { gp: 100, sp: 50 };
			expect(normalizeCurrency(raw)).toEqual({ gp: 100, sp: 50 });
		});

		it("ignores zero and negative", () => {
			const raw = { gp: 10, sp: 0, cp: -5 };
			expect(normalizeCurrency(raw)).toEqual({ gp: 10 });
		});

		it("returns empty for invalid input", () => {
			expect(normalizeCurrency(null)).toEqual({});
			expect(normalizeCurrency([])).toEqual({});
		});
	});

	describe("isNoOutputError", () => {
		it("returns true for No output generated", () => {
			expect(isNoOutputError(new Error("No output generated"))).toBe(true);
		});

		it("returns true for AI_NoOutputGeneratedError", () => {
			expect(isNoOutputError("AI_NoOutputGeneratedError")).toBe(true);
		});

		it("returns false for other errors", () => {
			expect(isNoOutputError(new Error("Something else"))).toBe(false);
			expect(isNoOutputError("generic error")).toBe(false);
		});
	});
});
