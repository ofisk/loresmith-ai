import { describe, expect, it } from "vitest";
import {
	buildLlmResultCacheKey,
	type LlmResultCacheKeyInput,
} from "../../src/lib/llm-result-cache-key";

const BASE: LlmResultCacheKeyInput = {
	kind: "entity_extraction",
	model: "claude-sonnet-5",
	promptPrefix: "Extract entities from the document.\n\nCONTENT START\n",
	variablePart:
		"The village of Harrow's Rest sits at the foot of the Grey Spine.",
};

describe("buildLlmResultCacheKey", () => {
	it("is stable for identical input", async () => {
		const a = await buildLlmResultCacheKey(BASE);
		const b = await buildLlmResultCacheKey({ ...BASE });
		expect(a.cacheKey).toBe(b.cacheKey);
		expect(a.cacheKey).toMatch(/^[0-9a-f]{64}$/);
	});

	it("changes when the content changes", async () => {
		const a = await buildLlmResultCacheKey(BASE);
		const b = await buildLlmResultCacheKey({
			...BASE,
			variablePart: `${BASE.variablePart} It has been there a long time.`,
		});
		expect(a.cacheKey).not.toBe(b.cacheKey);
	});

	it("changes when the prompt changes, which is the whole point of hashing it", async () => {
		// This is the property that replaces a hand-maintained prompt version:
		// editing an instruction must not serve results the old instruction produced.
		const a = await buildLlmResultCacheKey(BASE);
		const b = await buildLlmResultCacheKey({
			...BASE,
			promptPrefix: `${BASE.promptPrefix}Also extract factions.\n`,
		});
		expect(a.cacheKey).not.toBe(b.cacheKey);
	});

	it("changes when the model changes, so a tier change does not serve stale output", async () => {
		const a = await buildLlmResultCacheKey(BASE);
		const b = await buildLlmResultCacheKey({
			...BASE,
			model: "claude-haiku-4-5",
		});
		expect(a.cacheKey).not.toBe(b.cacheKey);
	});

	it("changes when the kind changes", async () => {
		const a = await buildLlmResultCacheKey(BASE);
		const b = await buildLlmResultCacheKey({
			...BASE,
			kind: "character_sheet_parse",
		});
		expect(a.cacheKey).not.toBe(b.cacheKey);
	});

	it("cannot be collided by moving text across the prompt/content boundary", async () => {
		// A naive `${prefix}|${content}` join would give these two the same key.
		const a = await buildLlmResultCacheKey({
			...BASE,
			promptPrefix: "AB",
			variablePart: "C",
		});
		const b = await buildLlmResultCacheKey({
			...BASE,
			promptPrefix: "A",
			variablePart: "BC",
		});
		expect(a.cacheKey).not.toBe(b.cacheKey);
	});

	it("reports a prompt digest that ignores the content", async () => {
		const a = await buildLlmResultCacheKey(BASE);
		const b = await buildLlmResultCacheKey({
			...BASE,
			variablePart: "completely different content",
		});
		expect(a.promptDigest).toBe(b.promptDigest);
	});
});
