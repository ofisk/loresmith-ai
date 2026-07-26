import { describe, expect, it } from "vitest";
import { formatCharacterSheetDetectionPrompt } from "../../src/lib/prompts/character-sheet-prompts";

describe("formatCharacterSheetDetectionPrompt", () => {
	it("omits the reasoning field by default", () => {
		// Output is billed at 5x input and nothing downstream reads the
		// explanation, so it is not requested on the normal upload path.
		const prompt = formatCharacterSheetDetectionPrompt("some text");
		expect(prompt).not.toContain("reasoning:");
	});

	it("requests reasoning when explicitly enabled for debugging", () => {
		const prompt = formatCharacterSheetDetectionPrompt("some text", {
			includeReasoning: true,
		});
		expect(prompt).toContain("reasoning: string");
	});

	it("still asks for the fields the detector actually acts on", () => {
		const prompt = formatCharacterSheetDetectionPrompt("some text");
		expect(prompt).toContain("isCharacterSheet: boolean");
		expect(prompt).toContain("confidence: number");
		expect(prompt).toContain("characterName");
		expect(prompt).toContain("detectedGameSystem");
		expect(prompt).toContain("some text");
	});
});
