import { describe, expect, it } from "vitest";
import { extractVisualDescriptionForTitle } from "@/services/campaign/visual-inspiration-title";

describe("extractVisualDescriptionForTitle", () => {
	it("strips leading Visual inspiration reference block before the first blank line gap", () => {
		const full = `Visual inspiration reference
Source type: image/png

A warrior stands on cliffs under a blood moon.`;

		expect(extractVisualDescriptionForTitle(full)).toBe(
			"A warrior stands on cliffs under a blood moon."
		);
	});

	it("returns trimmed text unchanged when no boilerplate prefix", () => {
		expect(extractVisualDescriptionForTitle("  Plain notes  ")).toBe(
			"Plain notes"
		);
	});
});
