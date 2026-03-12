import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCharacterWithAI } from "@/tools/campaign-context/ai-helpers";
import { parseGeneratedCharacter } from "@/tools/campaign-context/character-generation-utils";

vi.mock("@/tools/campaign-context/character-rules-fetcher", () => ({
	fetchCharacterCreationRules: vi.fn(),
}));

describe("character-generation-utils", () => {
	describe("parseGeneratedCharacter", () => {
		it("parses valid LLM output", () => {
			const raw = {
				characterName: "Thorin",
				characterClass: "Fighter",
				characterLevel: 5,
				characterRace: "Dwarf",
				backstory: "A brave warrior from the mountains.",
				personalityTraits: "Brave, Honorable",
				goals: "Thorin seeks to reclaim his homeland.",
				relationships: ["Has a mentor who taught them their skills"],
			};
			const result = parseGeneratedCharacter(raw);
			expect(result).toEqual({
				characterName: "Thorin",
				characterClass: "Fighter",
				characterLevel: 5,
				characterRace: "Dwarf",
				backstory: "A brave warrior from the mountains.",
				personalityTraits: "Brave, Honorable",
				goals: "Thorin seeks to reclaim his homeland.",
				relationships: ["Has a mentor who taught them their skills"],
			});
		});

		it("handles snake_case from LLM", () => {
			const raw = {
				character_name: "Elara",
				character_class: "Wizard",
				character_level: 3,
				character_race: "Elf",
				backstory: "A curious scholar.",
				personality_traits: "Intellectual",
				goals: "Seeks knowledge.",
				relationships: [],
			};
			const result = parseGeneratedCharacter(raw);
			expect(result.characterName).toBe("Elara");
			expect(result.characterClass).toBe("Wizard");
			expect(result.characterLevel).toBe(3);
			expect(result.characterRace).toBe("Elf");
			expect(result.personalityTraits).toBe("Intellectual");
		});

		it("uses defaults for missing fields", () => {
			const raw = {};
			const result = parseGeneratedCharacter(raw);
			expect(result.characterName).toBe("Unknown");
			expect(result.characterClass).toBe("Adventurer");
			expect(result.characterLevel).toBe(1);
			expect(result.characterRace).toBe("—");
			expect(result.backstory).toBe("No backstory provided.");
			expect(result.personalityTraits).toBe("Adventurous");
			expect(result.goals).toBe("Seeks adventure.");
			expect(result.relationships).toEqual([]);
		});

		it("throws for non-object input", () => {
			expect(() => parseGeneratedCharacter(null)).toThrow(
				"Invalid character data"
			);
			expect(() => parseGeneratedCharacter("string")).toThrow(
				"Invalid character data"
			);
			expect(() => parseGeneratedCharacter([])).toThrow(
				"Invalid character data"
			);
		});
	});

	describe("generateCharacterWithAI (ai-helpers)", () => {
		const mockEnv = { DB: {} } as any;

		beforeEach(async () => {
			const { fetchCharacterCreationRules } = await import(
				"@/tools/campaign-context/character-rules-fetcher"
			);
			vi.mocked(fetchCharacterCreationRules).mockResolvedValue({
				rules: { classes: [], species: [], ruleExcerpts: "" },
				hasMinimalRules: false,
			});
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("returns needsClarification when campaign has no rules and invent not allowed", async () => {
			const result = await generateCharacterWithAI(
				{
					campaignId: "camp-1",
					characterName: "Test",
					characterLevel: 1,
					campaignName: "Test Campaign",
					toolCallId: "tc-1",
					allowInventIfNoRules: false,
				},
				mockEnv
			);

			expect(result.result.success).toBe(true);
			const data = result.result.data as Record<string, unknown>;
			expect(data.needsClarification).toBe(true);
			expect(data.suggestedQuestions).toBeDefined();
			expect(Array.isArray(data.suggestedQuestions)).toBe(true);
		});
	});
});
