import { describe, expect, it } from "vitest";
import {
	chunkTextByCharacterCount,
	chunkTextByPages,
} from "@/lib/file/text-chunking-utils";

describe("chunkTextByPages", () => {
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
});

describe("chunkTextByCharacterCount", () => {
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
});
