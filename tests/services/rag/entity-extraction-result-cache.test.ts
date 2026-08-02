import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmResultCacheDAO } from "../../../src/dao/llm-result-cache-dao";
import {
	buildExtractionPromptParts,
	EntityExtractionService,
} from "../../../src/services/rag/entity-extraction-service";

const generateStructuredOutput = vi.fn();

vi.mock("@/services/llm/llm-provider-factory", () => ({
	createLLMProvider: vi.fn(() => ({ generateStructuredOutput })),
}));

const PAYLOAD = {
	meta: { source: { doc: "Harrow's Rest Gazetteer" } },
	npcs: [{ id: "npc-1", name: "Ilsa Vantry", summary: "The miller." }],
	locations: [{ id: "loc-1", name: "Harrow's Rest" }],
};

/** In-memory stand-in for the D1-backed cache DAO. */
function inMemoryDao(): LlmResultCacheDAO {
	const rows = new Map<string, { payload: string; model: string }>();
	return {
		isSchemaReady: async () => true,
		get: async (cacheKey: string) =>
			rows.has(cacheKey)
				? ({
						cache_key: cacheKey,
						...rows.get(cacheKey),
						hit_count: 0,
					} as never)
				: null,
		put: async (input: {
			cacheKey: string;
			model: string;
			payload: string;
		}) => {
			if (!rows.has(input.cacheKey)) {
				rows.set(input.cacheKey, {
					payload: input.payload,
					model: input.model,
				});
			}
		},
		recordHit: async () => {},
	} as unknown as LlmResultCacheDAO;
}

async function makeCache() {
	const { createLlmResultCacheForDao } = await import(
		"../../../src/services/llm/llm-result-cache"
	);
	return createLlmResultCacheForDao(inMemoryDao());
}

const OPTIONS = {
	content: "The village of Harrow's Rest sits at the foot of the Grey Spine.",
	sourceName: "Harrow's Rest Gazetteer",
	sourceId: "resource-1",
	sourceType: "file_upload",
	llmApiKey: "test-key",
};

describe("EntityExtractionService result cache (issue #761, finding 8)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		generateStructuredOutput.mockResolvedValue(PAYLOAD);
	});

	it("calls the model once for repeated extraction of identical content", async () => {
		const service = new EntityExtractionService(null, null, await makeCache());

		await service.extractEntities({ ...OPTIONS, campaignId: "campaign-a" });
		await service.extractEntities({ ...OPTIONS, campaignId: "campaign-a" });

		expect(generateStructuredOutput).toHaveBeenCalledTimes(1);
	});

	it("serves a second campaign from the cache but re-scopes the entity IDs", async () => {
		// This is the property that makes the cache worth having: the stored
		// payload is campaign-independent, so adding the same document to another
		// campaign is a hit — while the entities it produces still belong to that
		// campaign, not the one that paid for the extraction.
		const service = new EntityExtractionService(null, null, await makeCache());

		const first = await service.extractEntities({
			...OPTIONS,
			campaignId: "campaign-a",
		});
		const second = await service.extractEntities({
			...OPTIONS,
			campaignId: "campaign-b",
		});

		expect(generateStructuredOutput).toHaveBeenCalledTimes(1);
		expect(first.map((e) => e.name).sort()).toEqual(
			second.map((e) => e.name).sort()
		);
		expect(first.every((e) => e.id.startsWith("campaign-a_"))).toBe(true);
		expect(second.every((e) => e.id.startsWith("campaign-b_"))).toBe(true);
		expect(second.every((e) => e.metadata.campaignId === "campaign-b")).toBe(
			true
		);
	});

	it("misses when the content differs", async () => {
		const service = new EntityExtractionService(null, null, await makeCache());

		await service.extractEntities({ ...OPTIONS, campaignId: "campaign-a" });
		await service.extractEntities({
			...OPTIONS,
			campaignId: "campaign-a",
			content: "A different chunk entirely.",
		});

		expect(generateStructuredOutput).toHaveBeenCalledTimes(2);
	});

	it("hits across source names, because the extraction prompt does not contain one", async () => {
		// `formatStructuredContentPrompt(resourceName)` substitutes whole-word
		// "document", and the 15k-character prompt contains no whole-word match —
		// the only near-miss is `"doc": "document_id"`, where `_` is a word
		// character. So the rendered prompt is byte-identical for every source, and
		// the same chunk text extracted under two different file names is genuinely
		// the same call. See `prompt-does-not-vary-by-source-name` below, which
		// pins that premise so this test cannot quietly start lying.
		const service = new EntityExtractionService(null, null, await makeCache());

		await service.extractEntities({ ...OPTIONS, campaignId: "campaign-a" });
		await service.extractEntities({
			...OPTIONS,
			campaignId: "campaign-a",
			sourceName: "A Different Sourcebook",
		});

		expect(generateStructuredOutput).toHaveBeenCalledTimes(1);
	});

	it("prompt-does-not-vary-by-source-name", () => {
		// The premise of the test above. If someone adds a whole-word "document"
		// to the extraction prompt, the source name starts reaching the model, the
		// cacheable prefix stops being shared across documents, and this fails
		// first — which is the point.
		const a = buildExtractionPromptParts("Alpha Sourcebook", "chunk");
		const b = buildExtractionPromptParts("Beta Gazetteer", "chunk");
		expect(a.cacheablePrefix).toBe(b.cacheablePrefix);
		expect(a.cacheablePrefix).not.toContain("Alpha Sourcebook");
	});

	it("retries the model when the first call produced no usable output", async () => {
		const service = new EntityExtractionService(null, null, await makeCache());
		generateStructuredOutput.mockRejectedValueOnce(
			new Error("AI_NoObjectGeneratedError: No object generated")
		);

		const empty = await service.extractEntities({
			...OPTIONS,
			campaignId: "campaign-a",
		});
		expect(empty).toEqual([]);

		const recovered = await service.extractEntities({
			...OPTIONS,
			campaignId: "campaign-a",
		});
		expect(recovered.length).toBeGreaterThan(0);
		expect(generateStructuredOutput).toHaveBeenCalledTimes(2);
	});

	it("calls the model every time when no cache is supplied", async () => {
		const service = new EntityExtractionService(null);

		await service.extractEntities({ ...OPTIONS, campaignId: "campaign-a" });
		await service.extractEntities({ ...OPTIONS, campaignId: "campaign-a" });

		expect(generateStructuredOutput).toHaveBeenCalledTimes(2);
	});
});
