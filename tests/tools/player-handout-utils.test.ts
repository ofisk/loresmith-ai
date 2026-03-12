import { describe, expect, it } from "vitest";
import { sanitizeFileName } from "@/tools/campaign-context/player-handout-utils";

describe("player-handout-utils", () => {
	describe("sanitizeFileName", () => {
		it("lowercases and replaces spaces with hyphens", () => {
			expect(sanitizeFileName("The Dark Tower")).toBe("the-dark-tower");
		});

		it("removes invalid filename characters", () => {
			expect(sanitizeFileName("File/with\\invalid:chars*")).toBe(
				"filewithinvalidchars"
			);
		});

		it("returns handout for empty result", () => {
			expect(sanitizeFileName("!!!")).toBe("handout");
			expect(sanitizeFileName("   ")).toBe("handout");
		});
	});
});
