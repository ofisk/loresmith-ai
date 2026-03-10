import { describe, expect, it } from "vitest";
import {
	isEntityStub,
	isStubContent,
	mergeEntityContent,
} from "@/lib/entity/entity-content-merge";

describe("mergeEntityContent", () => {
	it("returns undefined when both are null", () => {
		expect(mergeEntityContent(null, null)).toBeUndefined();
	});

	it("returns existing when incoming is null", () => {
		const existing = { name: "Test" };
		expect(mergeEntityContent(existing, null)).toBe(existing);
	});

	it("returns incoming when existing is null", () => {
		const incoming = { name: "Test" };
		expect(mergeEntityContent(null, incoming)).toBe(incoming);
	});

	it("replaces with incoming array when non-empty", () => {
		const existing = { items: [1, 2] };
		const incoming = [3, 4, 5];
		expect(mergeEntityContent(existing, incoming)).toEqual([3, 4, 5]);
	});

	it("keeps existing when incoming array is empty", () => {
		const existing = { items: [1, 2] };
		expect(mergeEntityContent(existing, [])).toEqual({ items: [1, 2] });
	});

	it("deep merges objects preferring non-empty incoming values", () => {
		const existing = { a: 1, b: "keep", c: { x: 1 } };
		const incoming = { a: 2, c: { x: 2, y: 3 } };
		expect(mergeEntityContent(existing, incoming)).toEqual({
			a: 2,
			b: "keep",
			c: { x: 2, y: 3 },
		});
	});

	it("preserves existing when incoming value is empty string", () => {
		const existing = { name: "Original" };
		const incoming = { name: "" };
		expect(mergeEntityContent(existing, incoming)).toEqual({
			name: "Original",
		});
	});

	it("recursively merges nested objects", () => {
		const existing = { meta: { a: 1, b: 2 } };
		const incoming = { meta: { b: 20, c: 3 } };
		expect(mergeEntityContent(existing, incoming)).toEqual({
			meta: { a: 1, b: 20, c: 3 },
		});
	});

	it("returns incoming when existing is array and incoming is object", () => {
		const existing = [1, 2, 3];
		const incoming = { key: "value" };
		expect(mergeEntityContent(existing, incoming)).toEqual(incoming);
	});

	it("merges when both incVal and existingVal are objects", () => {
		const existing = { nested: { a: 1 } };
		const incoming = { nested: { b: 2 } };
		expect(mergeEntityContent(existing, incoming)).toEqual({
			nested: { a: 1, b: 2 },
		});
	});

	it("returns primitive when both are non-object non-array", () => {
		expect(mergeEntityContent("hello", "world")).toBe("world");
		expect(mergeEntityContent(1, 2)).toBe(2);
	});
});

describe("isStubContent", () => {
	it("returns true for null", () => {
		expect(isStubContent(null)).toBe(true);
	});

	it("returns true for short string", () => {
		expect(isStubContent("short")).toBe(true);
	});

	it("returns true for string under 100 chars, false for 100+", () => {
		expect(isStubContent("a".repeat(99))).toBe(true);
		expect(isStubContent("a".repeat(100))).toBe(false);
	});

	it("returns false for array", () => {
		expect(isStubContent([1, 2, 3])).toBe(false);
	});

	it("returns true for object with only summary-like short content", () => {
		expect(isStubContent({ overview: "short" })).toBe(true);
	});

	it("returns false for object with other non-empty fields", () => {
		expect(isStubContent({ overview: "x", factions: ["a"] })).toBe(false);
	});

	it("returns false for object with long summary", () => {
		expect(isStubContent({ summary: "a".repeat(101) })).toBe(false);
	});

	it("returns false when summaryLikeCount > 1", () => {
		expect(isStubContent({ overview: "a", summary: "b" })).toBe(false);
	});

	it("counts summary-like object length", () => {
		expect(isStubContent({ overview: { nested: "short" } })).toBe(true);
	});
});

describe("isEntityStub", () => {
	it("returns false when metadata is undefined", () => {
		expect(isEntityStub({})).toBe(false);
	});

	it("returns false when isStub is false", () => {
		expect(isEntityStub({ metadata: { isStub: false } })).toBe(false);
	});

	it("returns true when isStub is true", () => {
		expect(isEntityStub({ metadata: { isStub: true } })).toBe(true);
	});
});
