import { describe, expect, it } from "vitest";
import {
	getResourceSearchHaystack,
	matchesResourceSearch,
	parseTags,
} from "@/lib/resource-tags";

describe("parseTags", () => {
	it("parses JSON array string", () => {
		expect(parseTags('["a","b"]')).toEqual(["a", "b"]);
	});

	it("parses comma-separated string when not JSON", () => {
		expect(parseTags("foo, bar")).toEqual(["foo", "bar"]);
	});

	it("returns array as-is", () => {
		expect(parseTags(["x", "y"])).toEqual(["x", "y"]);
	});

	it("returns empty for undefined", () => {
		expect(parseTags(undefined)).toEqual([]);
	});
});

describe("getResourceSearchHaystack", () => {
	it("includes display_name, file_name, description, and tags", () => {
		const haystack = getResourceSearchHaystack({
			display_name: "Shown",
			file_name: "hidden.pdf",
			description: "About dragons",
			tags: '["lore"]',
		});
		expect(haystack).toContain("Shown");
		expect(haystack).toContain("hidden.pdf");
		expect(haystack).toContain("About dragons");
		expect(haystack).toContain("lore");
	});
});

describe("matchesResourceSearch", () => {
	it("matches on display_name", () => {
		expect(
			matchesResourceSearch(
				{ display_name: "Spellbook", file_name: "x.pdf" },
				"spell"
			)
		).toBe(true);
	});

	it("matches on file_name when display differs", () => {
		expect(
			matchesResourceSearch(
				{ display_name: "Custom", file_name: "original-name.pdf" },
				"original"
			)
		).toBe(true);
	});

	it("matches on description", () => {
		expect(
			matchesResourceSearch(
				{ file_name: "a.pdf", description: "Session zero notes" },
				"session"
			)
		).toBe(true);
	});

	it("matches on JSON tags string", () => {
		expect(
			matchesResourceSearch(
				{ file_name: "a.pdf", tags: '["maps","npcs"]' },
				"npcs"
			)
		).toBe(true);
	});

	it("matches on comma-separated tags", () => {
		expect(
			matchesResourceSearch({ file_name: "a.pdf", tags: "foo, bar baz" }, "bar")
		).toBe(true);
	});

	it("returns true for whitespace-only query (shows full list)", () => {
		expect(matchesResourceSearch({ file_name: "secret.pdf" }, "   ")).toBe(
			true
		);
	});

	it("returns false when nothing matches", () => {
		expect(
			matchesResourceSearch(
				{ file_name: "alpha.pdf", description: "beta" },
				"gamma"
			)
		).toBe(false);
	});
});
