import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentExtractionProvider } from "@/services/campaign/content-extraction-provider";
import type {
	ChunkBatchDecision,
	EntityExtractionBatchCoordinator,
} from "@/services/campaign/entity-extraction-batch-coordinator";
import { stageLibraryEntitiesFromFile } from "@/services/campaign/entity-staging-service";

/**
 * Covers the batch seam in entity staging (issue #735): what each coordinator
 * verdict does to the per-chunk extraction path.
 */

const mockState = vi.hoisted(() => ({
	inlineCalls: [] as string[],
	mappedPayloads: [] as unknown[],
}));

vi.mock("@/dao/dao-factory", () => ({ getDAOFactory: vi.fn() }));

vi.mock("@/services/llm/llm-rate-limit-service", () => ({
	getLLMRateLimitService: vi.fn().mockReturnValue({
		recordUsage: vi.fn().mockResolvedValue(undefined),
	}),
}));

vi.mock("@/lib/notifications", () => ({
	notifyCampaignMembers: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/rag/entity-extraction-service", () => ({
	EntityExtractionService: vi.fn().mockImplementation(function (this: any) {
		this.extractEntities = vi
			.fn()
			.mockImplementation(async (opts: { content: string }) => {
				mockState.inlineCalls.push(opts.content);
				return [];
			});
		this.mapExtractionPayload = vi
			.fn()
			.mockImplementation(async (payload: unknown) => {
				mockState.mappedPayloads.push(payload);
				return [];
			});
	}),
}));

vi.mock("@/services/character-sheet/character-sheet-detection-service", () => ({
	CharacterSheetDetectionService: vi.fn().mockImplementation(function (
		this: any
	) {
		this.detectCharacterSheet = vi
			.fn()
			.mockResolvedValue({ confidence: 0.1, characterName: null });
		this.isConfidentDetection = () => false;
	}),
}));

vi.mock("@/services/campaign/visual-inspiration-title", () => ({
	generateVisualInspirationTitle: vi.fn().mockResolvedValue("title"),
}));

vi.mock("@/services/rag/extraction-chunk-gate", () => ({
	isExtractionChunkGateEnabled: vi.fn().mockResolvedValue(false),
	evaluateExtractionChunkGate: vi
		.fn()
		.mockResolvedValue({ runFullExtraction: true, latencyMs: 1 }),
}));

import { getDAOFactory } from "@/dao/dao-factory";
import { isExtractionChunkGateEnabled } from "@/services/rag/extraction-chunk-gate";

/** Long enough that MAX_CHUNK_SIZE (12000 on Anthropic) splits it into several chunks. */
const LONG_CONTENT = "Goblin ambush in the woods. ".repeat(1300);

function coordinator(decision: ChunkBatchDecision) {
	const resolveChunkOutputs = vi.fn().mockResolvedValue(decision);
	return {
		coordinator: { resolveChunkOutputs } as EntityExtractionBatchCoordinator,
		resolveChunkOutputs,
	};
}

/**
 * A coordinator that answers `ready` with payloads for the chunks `serve`
 * selects out of the actual plan — so a test states "batch served all but one"
 * without hard-coding how many chunks the content happens to split into.
 */
function readyCoordinator(serve: (index: number, total: number) => boolean) {
	// `totalChunks` is only present on some staging return paths, so record the
	// plan's chunk count here and assert against that instead.
	const observed = { plannedChunks: 0, servedChunks: 0 };
	const resolveChunkOutputs = vi
		.fn()
		.mockImplementation(async (plan: { chunks: { globalIndex: number }[] }) => {
			observed.plannedChunks = plan.chunks.length;
			const outputsByChunkIndex = new Map<number, unknown>();
			for (const chunk of plan.chunks) {
				if (serve(chunk.globalIndex, plan.chunks.length)) {
					outputsByChunkIndex.set(chunk.globalIndex, {
						monsters: [{ name: `chunk-${chunk.globalIndex}` }],
					});
				}
			}
			observed.servedChunks = outputsByChunkIndex.size;
			return { status: "ready", outputsByChunkIndex };
		});
	return {
		coordinator: { resolveChunkOutputs } as EntityExtractionBatchCoordinator,
		resolveChunkOutputs,
		observed,
	};
}

function contentProvider(content = LONG_CONTENT): ContentExtractionProvider {
	return {
		extractContent: async () => ({
			success: true,
			content,
			metadata: { isPDF: false },
		}),
	};
}

async function stage(
	batchCoordinator?: EntityExtractionBatchCoordinator,
	content?: string
) {
	return stageLibraryEntitiesFromFile({
		env: { DB: {} } as any,
		username: "alice",
		fileKey: "library/alice/monsters.pdf",
		resource: {
			id: "library/alice/monsters.pdf",
			file_key: "library/alice/monsters.pdf",
			file_name: "monsters.pdf",
			campaign_id: "lib-synthetic",
		},
		campaignRagBasePath: "library/alice/",
		llmApiKey: "sk-test",
		contentExtractionProvider: contentProvider(content),
		batchCoordinator,
	});
}

describe("entity staging — Anthropic message batch seam", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockState.inlineCalls = [];
		mockState.mappedPayloads = [];
		(getDAOFactory as any).mockReturnValue({
			entityDAO: {},
			entityImportanceDAO: {},
		});
		(isExtractionChunkGateEnabled as any).mockResolvedValue(false);
	});

	it("makes no model calls and reports awaitingBatch while a batch is in flight", async () => {
		const { coordinator: coord } = coordinator({ status: "awaiting" });

		const result = await stage(coord);

		expect(result.awaitingBatch).toBe(true);
		expect(result.completed).toBe(false);
		expect(result.entityCount).toBe(0);
		expect(mockState.inlineCalls).toHaveLength(0);
	});

	it("keeps the resume cursor put while awaiting, so no chunk is skipped", async () => {
		const { coordinator: coord } = coordinator({ status: "awaiting" });

		const result = await stage(coord);

		expect(result.nextChunkIndex).toBe(0);
		expect(result.totalChunks).toBeGreaterThan(1);
	});

	it("uses batch payloads instead of calling the model when results are ready", async () => {
		const { coordinator: coord, observed } = readyCoordinator(() => true);

		const result = await stage(coord);

		expect(observed.plannedChunks).toBeGreaterThan(1);
		expect(mockState.inlineCalls).toHaveLength(0);
		expect(mockState.mappedPayloads).toHaveLength(observed.plannedChunks);
		expect(result.batchServedChunks).toBe(observed.plannedChunks);
		expect(result.awaitingBatch).toBeUndefined();
	});

	it("re-extracts inline only the chunks the batch did not return", async () => {
		// Batch returned everything except chunk 1.
		const { coordinator: coord, observed } = readyCoordinator(
			(index) => index !== 1
		);

		const result = await stage(coord);

		expect(mockState.inlineCalls).toHaveLength(1);
		expect(result.batchServedChunks).toBe(observed.plannedChunks - 1);
		expect(mockState.mappedPayloads).toHaveLength(observed.plannedChunks - 1);
	});

	it("runs every chunk inline when the coordinator declines to batch", async () => {
		const { coordinator: coord } = coordinator({
			status: "inline",
			reason: "below_min_batch_size",
		});

		const result = await stage(coord);

		expect(mockState.inlineCalls.length).toBeGreaterThanOrEqual(3);
		expect(mockState.mappedPayloads).toHaveLength(0);
		expect(result.batchServedChunks).toBe(0);
	});

	it("skips the chunk gate for batch-served chunks but keeps it for inline fallbacks", async () => {
		(isExtractionChunkGateEnabled as any).mockResolvedValue(true);
		const { evaluateExtractionChunkGate } = await import(
			"@/services/rag/extraction-chunk-gate"
		);
		const { coordinator: coord } = readyCoordinator((index) => index !== 1);

		await stage(coord);

		// Only the one chunk that fell back inline is gated.
		expect(evaluateExtractionChunkGate).toHaveBeenCalledTimes(1);
	});

	it("behaves exactly as before when no coordinator is supplied", async () => {
		const result = await stage(undefined);

		expect(mockState.inlineCalls.length).toBeGreaterThanOrEqual(3);
		expect(result.awaitingBatch).toBeUndefined();
		expect(result.batchServedChunks).toBe(0);
	});

	it("passes the resume window and chunk plan to the coordinator", async () => {
		const { coordinator: coord, resolveChunkOutputs } = coordinator({
			status: "inline",
		});

		await stage(coord);

		const plan = resolveChunkOutputs.mock.calls[0][0];
		expect(plan.sourceName).toBe("monsters.pdf");
		expect(plan.chunkWindowStart).toBe(0);
		expect(plan.chunkWindowEnd).toBe(plan.totalChunks);
		expect(
			plan.chunks.map((c: { globalIndex: number }) => c.globalIndex)
		).toEqual(Array.from({ length: plan.totalChunks }, (_, i) => i));
	});

	it("does not consult the coordinator when there are no chunks to process", async () => {
		const { coordinator: coord, resolveChunkOutputs } = coordinator({
			status: "awaiting",
		});

		await stage(coord, "");

		expect(resolveChunkOutputs).not.toHaveBeenCalled();
	});
});
