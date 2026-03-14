import { describe, expect, it } from "vitest";
import {
	chunkTextByCharacterCount,
	chunkTextByPages,
	truncateContentAtSentenceBoundary,
} from "@/lib/file/text-chunking-utils";

describe("chunkTextByPages", () => {
	it("returns single chunk for empty string", () => {
		expect(chunkTextByPages("", 100)).toEqual([""]);
	});

	it("returns single chunk when text fits in maxChunkSize", () => {
		const text = "[Page 1]\nShort content";
		expect(chunkTextByPages(text, 1000)).toEqual([text]);
	});

	it("splits across pages when exceeding maxChunkSize", () => {
		const text = `[Page 1]\n${"a".repeat(50)}[Page 2]\n${"b".repeat(50)}`;
		const chunks = chunkTextByPages(text, 60);
		expect(chunks.length).toBeGreaterThanOrEqual(2);
	});

	it("preserves page markers in chunks", () => {
		const text = "[Page 1]\nContent1[Page 2]\nContent2";
		const chunks = chunkTextByPages(text, 100);
		expect(chunks.join("")).toBe(text);
	});

	it("returns text as single chunk when no page markers", () => {
		const text = "No page markers here";
		expect(chunkTextByPages(text, 10)).toEqual([text]);
	});

	it("returns non-empty chunks only", () => {
		const text = "[Page 1]\nX";
		const chunks = chunkTextByPages(text, 5);
		expect(chunks.every((c) => c.trim().length > 0)).toBe(true);
	});

	it("handles single page marker only", () => {
		const text = "[Page 1]\n";
		const chunks = chunkTextByPages(text, 100);
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toBe(text);
	});
});

describe("chunkTextByCharacterCount", () => {
	it("returns single chunk for empty string", () => {
		expect(chunkTextByCharacterCount("", 100)).toEqual([""]);
	});

	it("returns single chunk when text is short", () => {
		const text = "Short text";
		expect(chunkTextByCharacterCount(text, 100)).toEqual([text]);
	});

	it("splits at sentence boundary when possible", () => {
		const text = "First sentence. Second sentence. Third sentence.";
		const chunks = chunkTextByCharacterCount(text, 25);
		expect(chunks.length).toBeGreaterThanOrEqual(2);
	});

	it("falls back to word boundary", () => {
		const text = "word1 word2 word3 word4 word5";
		const chunks = chunkTextByCharacterCount(text, 15);
		expect(chunks.length).toBeGreaterThanOrEqual(2);
	});

	it("returns original text when no good break point", () => {
		const text = "a".repeat(50);
		const chunks = chunkTextByCharacterCount(text, 20);
		expect(chunks.length).toBeGreaterThanOrEqual(2);
	});

	it("preserves all content when joined", () => {
		const text = "Lorem ipsum. Dolor sit amet. Consectetur adipiscing.";
		const chunks = chunkTextByCharacterCount(text, 30);
		expect(chunks.join(" ").replace(/\s+/g, " ").trim()).toBe(
			text.replace(/\s+/g, " ").trim()
		);
	});

	it("handles maxChunkSize of 1", () => {
		const text = "abc";
		const chunks = chunkTextByCharacterCount(text, 1);
		expect(chunks.length).toBeGreaterThanOrEqual(2);
		expect(chunks.join("")).toBe(text);
	});
});

describe("truncateContentAtSentenceBoundary", () => {
	it("returns empty string as-is", () => {
		expect(truncateContentAtSentenceBoundary("", 5000)).toBe("");
	});

	it("returns content as-is when shorter than maxChars", () => {
		const text = "Short content.";
		expect(truncateContentAtSentenceBoundary(text, 5000)).toBe(text);
	});

	it("truncates at sentence boundary when exceeding maxChars", () => {
		const text = "First sentence. Second sentence. ".repeat(200);
		expect(text.length).toBeGreaterThan(2000);
		const result = truncateContentAtSentenceBoundary(text, 1500);
		expect(result.length).toBeLessThan(text.length);
		expect(result).toContain("First sentence.");
		expect(result).toContain("[Content truncated for context limit");
	});

	it("respects minimum truncation chars of 2000", () => {
		const text = "a".repeat(5000);
		const result = truncateContentAtSentenceBoundary(text, 1000);
		expect(result.length).toBeGreaterThanOrEqual(2000);
	});

	it("breaks at last sentence boundary before maxChars", () => {
		const part1 = "Sentence one. ".repeat(150);
		const part2 = "Sentence two. ".repeat(150);
		const text = part1 + part2;
		const result = truncateContentAtSentenceBoundary(text, 2500);
		expect(result).toContain("[Content truncated for context limit");
		// Content before suffix should end at sentence boundary
		const beforeSuffix = result.replace(
			/\n\n\[Content truncated for context limit[^\]]*\]$/,
			""
		);
		expect(beforeSuffix.endsWith(".")).toBe(true);
	});

	it("truncates at effectiveMax when no sentence boundary in search region", () => {
		const noPeriods = "abc def ghi jkl mno ".repeat(200);
		expect(noPeriods.includes(".")).toBe(false);
		const result = truncateContentAtSentenceBoundary(noPeriods, 1000);
		expect(result).toContain("[Content truncated for context limit");
		expect(result.length).toBeLessThanOrEqual(Math.max(2000, 1000) + 100);
	});
});
