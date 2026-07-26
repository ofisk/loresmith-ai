import { describe, expect, it } from "vitest";
import {
	normalizeVisualInspirationTitle,
	readVisionTitleHeader,
	splitVisionTitleAndDescription,
} from "../../../src/lib/shard/vision-title";

describe("splitVisionTitleAndDescription", () => {
	it("pulls the TITLE line off the front of a vision response", () => {
		const result = splitVisionTitleAndDescription(
			"TITLE: Storm over the drowned keep\n\nA ruined fortress half-submerged."
		);
		expect(result.title).toBe("Storm over the drowned keep");
		expect(result.description).toBe("A ruined fortress half-submerged.");
	});

	it("tolerates spacing and casing variations", () => {
		expect(
			splitVisionTitleAndDescription("title :  Ashen market at dusk \nBody")
				.title
		).toBe("Ashen market at dusk");
	});

	it("strips surrounding quotes the model sometimes adds", () => {
		expect(
			splitVisionTitleAndDescription('TITLE: "Ashen market at dusk"\nBody')
				.title
		).toBe("Ashen market at dusk");
	});

	it("returns the whole response as description when the model ignored the instruction", () => {
		const raw = "A ruined fortress half-submerged in grey water.";
		const result = splitVisionTitleAndDescription(raw);
		expect(result.title).toBeNull();
		expect(result.description).toBe(raw);
	});

	it("treats an empty TITLE value as no title", () => {
		const result = splitVisionTitleAndDescription('TITLE: ""\nBody');
		expect(result.title).toBeNull();
		expect(result.description).toBe('TITLE: ""\nBody');
	});

	it("handles a title-only response with no description", () => {
		const result = splitVisionTitleAndDescription("TITLE: Ashen market");
		expect(result.title).toBe("Ashen market");
		expect(result.description).toBe("");
	});
});

describe("readVisionTitleHeader", () => {
	const blob = (header: string) =>
		`Visual inspiration reference\nSource type: image/png\n${header}\n\nA ruined fortress.`;

	it("reads the Title header the vision pass wrote", () => {
		expect(
			readVisionTitleHeader(blob("Title: Storm over the drowned keep"))
		).toBe("Storm over the drowned keep");
	});

	it("returns null for content extracted before titles were emitted", () => {
		expect(
			readVisionTitleHeader(
				"Visual inspiration reference\nSource type: image/png\n\nA ruined fortress."
			)
		).toBeNull();
	});

	it("returns null for text that is not a vision blob", () => {
		expect(readVisionTitleHeader("Title: Not a vision blob")).toBeNull();
	});

	it("ignores a Title-like line that appears in the description body", () => {
		expect(
			readVisionTitleHeader(
				"Visual inspiration reference\nSource type: image/png\n\nTitle: this is prose"
			)
		).toBeNull();
	});
});

describe("normalizeVisualInspirationTitle", () => {
	it("trims whitespace and wrapping quotes", () => {
		expect(normalizeVisualInspirationTitle('  "Ashen market"  ')).toBe(
			"Ashen market"
		);
	});

	it("caps overlong titles with an ellipsis", () => {
		const long = "a".repeat(200);
		const result = normalizeVisualInspirationTitle(long);
		expect(result).toHaveLength(120);
		expect(result.endsWith("...")).toBe(true);
	});
});
