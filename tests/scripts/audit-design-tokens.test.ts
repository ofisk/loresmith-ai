// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	ROOT,
	scanButtonVariantUsage,
	scanModalSizeUsage,
	scanRawColorUtilities,
} from "../../scripts/check/audit-design-tokens.mjs";

describe("audit-design-tokens: synthetic fixtures", () => {
	let fixtureDir: string;

	beforeEach(() => {
		fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-fixture-"));
	});

	afterEach(() => {
		fs.rmSync(fixtureDir, { recursive: true, force: true });
	});

	function relativeFixturePath(): string {
		// Scanners resolve `paths` against ROOT, so pass a path relative to it.
		return path.relative(ROOT, fixtureDir);
	}

	it("finds raw semantic-color utilities and ignores structural neutrals", () => {
		fs.writeFileSync(
			path.join(fixtureDir, "Sample.tsx"),
			[
				'<div className="bg-purple-600 text-red-500 border-blue-300">',
				'  <span className="text-neutral-500 dark:text-neutral-400" />',
				'  <span className="text-green-700" />',
				"</div>",
			].join("\n")
		);

		const hits = scanRawColorUtilities([relativeFixturePath()]);
		const families = hits.map((h) => h.family).sort();

		expect(families).toEqual(["blue", "green", "purple", "red"]);
		// Neutral grays must never be flagged — they're structural, not brand/semantic.
		expect(hits.some((h) => h.match.includes("neutral"))).toBe(false);
	});

	it("reports accurate file:line for each match", () => {
		fs.writeFileSync(
			path.join(fixtureDir, "Sample.tsx"),
			[
				"line one",
				'line two <div className="bg-purple-600" />',
				"line three",
			].join("\n")
		);

		const hits = scanRawColorUtilities([relativeFixturePath()]);
		expect(hits).toHaveLength(1);
		expect(hits[0].line).toBe(2);
		expect(hits[0].match).toBe("bg-purple-600");
	});

	it("finds modal-size-* usage", () => {
		fs.writeFileSync(
			path.join(fixtureDir, "Sample.tsx"),
			'<Modal className="modal-size-md" />\n<Modal className="modal-size-xl" />'
		);

		const hits = scanModalSizeUsage([relativeFixturePath()]);
		expect(hits.map((h) => h.size).sort()).toEqual(["md", "xl"]);
	});

	it("finds <Button variant=...> usage but not other components' variant prop", () => {
		fs.writeFileSync(
			path.join(fixtureDir, "Sample.tsx"),
			[
				'<Button variant="destructive">Delete</Button>',
				'<Toggle variant="destructive" />',
				"<Button onClick={x}>No variant</Button>",
			].join("\n")
		);

		const hits = scanButtonVariantUsage([relativeFixturePath()]);
		expect(hits).toHaveLength(1);
		expect(hits[0].variant).toBe("destructive");
	});

	it("returns an empty array for a directory with no matches", () => {
		fs.writeFileSync(
			path.join(fixtureDir, "Sample.tsx"),
			'<div className="flex items-center gap-2" />'
		);

		expect(scanRawColorUtilities([relativeFixturePath()])).toEqual([]);
		expect(scanModalSizeUsage([relativeFixturePath()])).toEqual([]);
		expect(scanButtonVariantUsage([relativeFixturePath()])).toEqual([]);
	});
});

describe("audit-design-tokens: real codebase sanity check", () => {
	// Generous floors, not exact counts — Phase 2 migrations are expected to
	// shrink these over time. The point of this test is to fail loudly if the
	// scanner regex breaks and silently starts returning ~0 results, not to
	// pin today's exact numbers.
	it("finds a substantial number of raw color utilities in src/", () => {
		const hits = scanRawColorUtilities(["src"]);
		expect(hits.length).toBeGreaterThan(200);

		const purpleHits = hits.filter((h) => h.family === "purple");
		expect(purpleHits.length).toBeGreaterThan(20);
	});

	it("finds modal-size-* usage across more than one size", () => {
		const hits = scanModalSizeUsage(["src"]);
		const sizes = new Set(hits.map((h) => h.size));
		expect(sizes.size).toBeGreaterThan(1);
		expect(sizes.has("md")).toBe(true);
	});

	it("finds <Button variant=...> usage across more than one variant", () => {
		const hits = scanButtonVariantUsage(["src"]);
		const variants = new Set(hits.map((h) => h.variant));
		expect(variants.size).toBeGreaterThan(1);
	});
});
