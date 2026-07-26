import { describe, expect, it } from "vitest";
import { repairJsonDeterministically } from "../../src/lib/json-repair";

function repairAndParse(text: string): unknown {
	const repaired = repairJsonDeterministically(text);
	expect(
		repaired,
		`expected a deterministic repair for: ${text}`
	).not.toBeNull();
	return JSON.parse(repaired as string);
}

describe("repairJsonDeterministically", () => {
	it("returns already-valid JSON untouched in meaning", () => {
		expect(repairAndParse('{"a":1,"b":[2,3]}')).toEqual({ a: 1, b: [2, 3] });
	});

	it("removes trailing commas in objects and arrays", () => {
		expect(repairAndParse('{"a":1,"b":[1,2,],}')).toEqual({ a: 1, b: [1, 2] });
	});

	it("does not remove commas that appear inside strings", () => {
		expect(repairAndParse('{"a":"one, two, three",}')).toEqual({
			a: "one, two, three",
		});
	});

	it("escapes raw newlines and tabs inside string values", () => {
		expect(repairAndParse('{"a":"line one\nline two\ttabbed"}')).toEqual({
			a: "line one\nline two\ttabbed",
		});
	});

	it("strips line and block comments outside strings", () => {
		expect(repairAndParse('{ // leading\n"a":1, /* mid */ "b":2 }')).toEqual({
			a: 1,
			b: 2,
		});
	});

	it("keeps comment-like sequences that are inside strings", () => {
		expect(repairAndParse('{"url":"https://example.com/a"}')).toEqual({
			url: "https://example.com/a",
		});
	});

	it("normalizes smart quotes", () => {
		expect(repairAndParse("{“a”:1}")).toEqual({ a: 1 });
	});

	it("closes a response truncated mid-value, keeping the partial text", () => {
		expect(repairAndParse('{"name":"Ser Aldric","bio":"A knight who')).toEqual({
			name: "Ser Aldric",
			bio: "A knight who",
		});
	});

	it("drops a key truncated before its value", () => {
		expect(repairAndParse('{"name":"Ser Aldric","bi')).toEqual({
			name: "Ser Aldric",
		});
	});

	it("drops a dangling key that has a colon but no value", () => {
		expect(repairAndParse('{"name":"Ser Aldric","bio":')).toEqual({
			name: "Ser Aldric",
		});
	});

	it("drops a dangling comma left by truncation", () => {
		expect(repairAndParse('{"a":1,')).toEqual({ a: 1 });
	});

	it("closes nested containers in the right order", () => {
		expect(repairAndParse('{"npcs":[{"name":"A"},{"name":"B"')).toEqual({
			npcs: [{ name: "A" }, { name: "B" }],
		});
	});

	it("keeps a truncated array element, which is a value not a key", () => {
		expect(repairAndParse('{"tags":["undead","haunt')).toEqual({
			tags: ["undead", "haunt"],
		});
	});

	it("handles a trailing backslash that would otherwise escape the closing quote", () => {
		expect(repairAndParse('{"a":"path\\')).toEqual({ a: "path" });
	});

	it("returns null for damage beyond deterministic repair", () => {
		// A genuinely unescaped quote mid-string is ambiguous — we deliberately
		// do not guess, and the caller falls back to the LLM repair pass.
		expect(
			repairJsonDeterministically('{"a":"he said "hi" loudly"}')
		).toBeNull();
	});

	it("returns null for empty input", () => {
		expect(repairJsonDeterministically("")).toBeNull();
		expect(repairJsonDeterministically("   ")).toBeNull();
	});

	it("returns null rather than inventing structure for prose", () => {
		expect(
			repairJsonDeterministically("I could not complete that.")
		).toBeNull();
	});
});
