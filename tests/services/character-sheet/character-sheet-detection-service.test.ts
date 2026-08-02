import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmResultCacheDAO } from "../../../src/dao/llm-result-cache-dao";
import { CharacterSheetDetectionService } from "../../../src/services/character-sheet/character-sheet-detection-service";

const generateStructuredOutput = vi.fn();

vi.mock("@/services/llm/llm-provider-factory", () => ({
	createLLMProvider: vi.fn(() => ({ generateStructuredOutput })),
}));

/** English, substantial, and carrying no character-sheet vocabulary at all. */
const SESSION_NOTES = `The party arrived at the crossing well after dark and found the ferryman gone.
His hut was open and the fire had burned down to nothing, which the group read as
a bad sign rather than a coincidence. They argued about whether to wait until
morning or take the boat themselves, and in the end they took it, poling across
in near silence while the current pulled them steadily east of where they meant
to land. On the far bank they found a cart turned on its side and the marks of
something heavy dragged away from it toward the treeline. Nobody wanted to follow
those marks in the dark, so they made camp against the overturned cart and set a
watch. Around the third watch the youngest of them heard singing from somewhere
out past the trees, faint and in no language she recognised, and she woke the
others rather than investigate alone. By dawn the singing had stopped and the
drag marks were gone, brushed over so carefully that only the ferryman's dog,
which turned up sometime before sunrise, seemed to know where they had led.`;

const SHEET = `Character Name: Eleanor Vance
Class: Ranger   Level: 4   Race: Half-elf
Hit Points: 34   Armor Class: 16
Strength 12  Dexterity 18  Constitution 14
Skills: Survival +7, Perception +7
Equipment: longbow, studded leather, rope
Background: Outlander. Personality traits: quiet, watchful.
Spells: Hunter's Mark, Cure Wounds`;

function inMemoryDao(): LlmResultCacheDAO {
	const rows = new Map<string, { payload: string; model: string }>();
	return {
		isSchemaReady: async () => true,
		get: async (cacheKey: string) =>
			rows.has(cacheKey)
				? ({
						cache_key: cacheKey,
						...rows.get(cacheKey),
						hit_count: 0,
					} as never)
				: null,
		put: async (input: {
			cacheKey: string;
			model: string;
			payload: string;
		}) => {
			if (!rows.has(input.cacheKey)) {
				rows.set(input.cacheKey, {
					payload: input.payload,
					model: input.model,
				});
			}
		},
		recordHit: async () => {},
	} as unknown as LlmResultCacheDAO;
}

async function makeCache() {
	const { createLlmResultCacheForDao } = await import(
		"../../../src/services/llm/llm-result-cache"
	);
	return createLlmResultCacheForDao(inMemoryDao());
}

describe("CharacterSheetDetectionService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		generateStructuredOutput.mockResolvedValue({
			isCharacterSheet: true,
			confidence: 0.92,
			characterName: "Eleanor Vance",
			detectedGameSystem: "D&D 5e",
		});
	});

	describe("deterministic pre-screen (finding 5a)", () => {
		it("answers without a model call for prose carrying no sheet vocabulary", async () => {
			const service = new CharacterSheetDetectionService("key");
			const result = await service.detectCharacterSheet(SESSION_NOTES);

			expect(result.isCharacterSheet).toBe(false);
			expect(generateStructuredOutput).not.toHaveBeenCalled();
		});

		it("answers without a model call for empty content", async () => {
			const service = new CharacterSheetDetectionService("key");
			expect((await service.detectCharacterSheet("   ")).isCharacterSheet).toBe(
				false
			);
			expect(generateStructuredOutput).not.toHaveBeenCalled();
		});

		it("still sends a real character sheet to the model", async () => {
			// The pre-screen only ever short-circuits a negative. A positive verdict
			// is never taken deterministically, so no upload is misclassified as a
			// character sheet without the model agreeing.
			const service = new CharacterSheetDetectionService("key");
			const result = await service.detectCharacterSheet(SHEET);

			expect(generateStructuredOutput).toHaveBeenCalledTimes(1);
			expect(result.isCharacterSheet).toBe(true);
			expect(result.characterName).toBe("Eleanor Vance");
		});
	});

	describe("result cache (finding 8)", () => {
		it("detects the same document twice with one model call", async () => {
			const service = new CharacterSheetDetectionService(
				"key",
				await makeCache()
			);

			await service.detectCharacterSheet(SHEET);
			const second = await service.detectCharacterSheet(SHEET);

			expect(generateStructuredOutput).toHaveBeenCalledTimes(1);
			expect(second.characterName).toBe("Eleanor Vance");
		});

		it("does not cache a model failure, so the next upload retries", async () => {
			const service = new CharacterSheetDetectionService(
				"key",
				await makeCache()
			);
			generateStructuredOutput.mockRejectedValueOnce(
				new Error("AI_NoOutputGeneratedError: No output generated")
			);

			const failed = await service.detectCharacterSheet(SHEET);
			expect(failed.isCharacterSheet).toBe(false);

			const retried = await service.detectCharacterSheet(SHEET);
			expect(retried.isCharacterSheet).toBe(true);
			expect(generateStructuredOutput).toHaveBeenCalledTimes(2);
		});
	});

	it("applies the confidence threshold unchanged", () => {
		const service = new CharacterSheetDetectionService("key");
		expect(
			service.isConfidentDetection({ isCharacterSheet: true, confidence: 0.71 })
		).toBe(true);
		expect(
			service.isConfidentDetection({ isCharacterSheet: true, confidence: 0.69 })
		).toBe(false);
		expect(
			service.isConfidentDetection({
				isCharacterSheet: false,
				confidence: 0.99,
			})
		).toBe(false);
	});
});
