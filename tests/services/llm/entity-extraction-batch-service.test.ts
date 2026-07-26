import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChunkBatchPlan } from "@/services/campaign/entity-extraction-batch-coordinator";
import {
	cleanupStaleBatchJobs,
	EntityExtractionBatchService,
} from "@/services/llm/entity-extraction-batch-service";
import type {
	LLMBatchProvider,
	LlmBatchJobRow,
	LlmBatchResultEntry,
} from "@/types/llm-batch";

const FILE_KEY = "library/alice/monsters.pdf";
const FINGERPRINT = "1024:2026-07-01T00:00:00Z";

/** In-memory stand-in for `llm_batch_jobs`, matching the DAO's contract. */
class FakeBatchStore {
	rows: LlmBatchJobRow[] = [];
	schemaReady = true;

	row(overrides: Partial<LlmBatchJobRow> = {}): LlmBatchJobRow {
		return {
			id: "job-1",
			provider: "anthropic",
			provider_batch_id: "msgbatch_1",
			owner_kind: "library_entity_discovery",
			owner_key: FILE_KEY,
			username: "alice",
			model: "claude-sonnet-5",
			status: "in_progress",
			request_count: 3,
			succeeded_count: 0,
			errored_count: 0,
			requests: JSON.stringify([
				{ customId: "chunk-0", chunkIndex: 0 },
				{ customId: "chunk-1", chunkIndex: 1 },
				{ customId: "chunk-2", chunkIndex: 2 },
			]),
			content_fingerprint: FINGERPRINT,
			chunk_window_start: 0,
			chunk_window_end: 3,
			total_chunks: 3,
			deadline_at: new Date(Date.now() + 3_600_000).toISOString(),
			last_polled_at: null,
			poll_count: 0,
			input_tokens: 0,
			output_tokens: 0,
			last_error: null,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			completed_at: null,
			...overrides,
		};
	}
}

const store = new FakeBatchStore();

vi.mock("@/dao/llm-batch-job-dao", async () => {
	const actual = await vi.importActual<
		typeof import("@/dao/llm-batch-job-dao")
	>("@/dao/llm-batch-job-dao");
	class MockDAO {
		static parseRequests = actual.LlmBatchJobDAO.parseRequests;
		async isSchemaReady() {
			return store.schemaReady;
		}
		async getActiveForOwner(_kind: string, key: string) {
			return (
				store.rows.find(
					(r) =>
						r.owner_key === key &&
						(r.status === "submitting" || r.status === "in_progress")
				) ?? null
			);
		}
		async createSubmitting(input: {
			id: string;
			ownerKey: string;
			requests: { customId: string; chunkIndex: number }[];
			contentFingerprint: string | null;
			chunkWindowStart: number;
			chunkWindowEnd: number;
			totalChunks: number;
			model: string;
			username: string;
			deadlineAt: string;
		}) {
			const clash = await this.getActiveForOwner("", input.ownerKey);
			if (clash) return null;
			const created = store.row({
				id: input.id,
				status: "submitting",
				provider_batch_id: null,
				request_count: input.requests.length,
				requests: JSON.stringify(input.requests),
				content_fingerprint: input.contentFingerprint,
				chunk_window_start: input.chunkWindowStart,
				chunk_window_end: input.chunkWindowEnd,
				total_chunks: input.totalChunks,
				deadline_at: input.deadlineAt,
			});
			store.rows.push(created);
			return created;
		}
		async markInProgress(id: string, providerBatchId: string) {
			const row = store.rows.find((r) => r.id === id);
			if (row) {
				row.status = "in_progress";
				row.provider_batch_id = providerBatchId;
			}
		}
		async recordPoll() {}
		async markCollected(id: string) {
			const row = store.rows.find((r) => r.id === id);
			if (row) row.status = "collected";
		}
		async markTerminal(
			id: string,
			status: "failed" | "expired" | "canceled",
			error?: string
		) {
			const row = store.rows.find((r) => r.id === id);
			if (row) {
				row.status = status;
				row.last_error = error ?? null;
			}
		}
		async getStaleSubmitting(timeoutMinutes: number) {
			const cutoff = Date.now() - timeoutMinutes * 60_000;
			return store.rows.filter(
				(r) =>
					r.status === "submitting" && Date.parse(r.created_at + "Z") <= cutoff
			);
		}
		async getPastDeadline() {
			return store.rows.filter(
				(r) =>
					(r.status === "submitting" || r.status === "in_progress") &&
					Date.parse(r.deadline_at) <= Date.now()
			);
		}
	}
	return { ...actual, LlmBatchJobDAO: MockDAO };
});

// cleanupStaleBatchJobs reaches the DAO through the factory rather than
// constructing it directly, so route the factory at the same fake store.
vi.mock("@/dao/dao-factory", async () => {
	const { LlmBatchJobDAO } = await import("@/dao/llm-batch-job-dao");
	return {
		getDAOFactory: () => ({
			llmBatchJobDAO: new LlmBatchJobDAO({} as never),
		}),
	};
});

const checkBatchRequestBudget = vi.fn(async () => ({ allowed: true }));
const recordBatchUsage = vi.fn(async () => {});

vi.mock("@/services/llm/llm-rate-limit-service", () => ({
	getLLMRateLimitService: () => ({
		checkBatchRequestBudget,
		recordBatchUsage,
	}),
}));

vi.mock("@/lib/logger", () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}));

function payloadText(name: string): string {
	return JSON.stringify({
		meta: { source: { doc: "monsters.pdf" } },
		monsters: [{ id: name, name }],
	});
}

function fakeProvider(
	overrides: Partial<LLMBatchProvider> = {}
): LLMBatchProvider {
	return {
		submitBatch: vi.fn(async () => ({
			providerBatchId: "msgbatch_new",
			requestCount: 3,
		})),
		getBatchStatus: vi.fn(async () => ({
			providerBatchId: "msgbatch_1",
			processingStatus: "ended" as const,
			counts: {
				processing: 0,
				succeeded: 3,
				errored: 0,
				canceled: 0,
				expired: 0,
			},
		})),
		getBatchResults: vi.fn(async () => [] as LlmBatchResultEntry[]),
		cancelBatch: vi.fn(async () => {}),
		...overrides,
	};
}

function plan(chunkCount = 3): ChunkBatchPlan {
	return {
		chunks: Array.from({ length: chunkCount }, (_, i) => ({
			chunk: `chunk body ${i}`,
			globalIndex: i,
		})),
		totalChunks: chunkCount,
		chunkWindowStart: 0,
		chunkWindowEnd: chunkCount,
		sourceName: "monsters.pdf",
	};
}

function service(provider: LLMBatchProvider, onStatus?: () => void) {
	return new EntityExtractionBatchService(
		{
			env: { DB: {} } as never,
			username: "alice",
			fileKey: FILE_KEY,
			llmApiKey: "sk-test",
			contentFingerprint: FINGERPRINT,
			onStatus,
		},
		provider
	);
}

describe("EntityExtractionBatchService", () => {
	beforeEach(() => {
		store.rows = [];
		store.schemaReady = true;
		checkBatchRequestBudget.mockResolvedValue({ allowed: true });
	});

	it("submits a batch and reports awaiting on the first pass", async () => {
		const provider = fakeProvider();
		const decision = await service(provider).resolveChunkOutputs(plan());

		expect(decision.status).toBe("awaiting");
		expect(provider.submitBatch).toHaveBeenCalledTimes(1);
		expect(store.rows[0].status).toBe("in_progress");
		expect(store.rows[0].provider_batch_id).toBe("msgbatch_new");
	});

	it("marks the shared instruction prefix as cacheable and keeps it identical across requests", async () => {
		const provider = fakeProvider();
		await service(provider).resolveChunkOutputs(plan());

		const [requests] = (provider.submitBatch as ReturnType<typeof vi.fn>).mock
			.calls[0];
		const prefixes = new Set(
			(requests as { cacheablePrefix: string }[]).map((r) => r.cacheablePrefix)
		);
		expect(prefixes.size).toBe(1);
		// Each request's own chunk must be in the variable half, not the prefix.
		expect([...prefixes][0]).not.toContain("chunk body 0");
		expect(
			(requests as { variableSuffix: string }[])[0].variableSuffix
		).toContain("chunk body 0");
	});

	it("gives every request a distinct custom_id tied to its chunk index", async () => {
		const provider = fakeProvider();
		await service(provider).resolveChunkOutputs(plan());

		const [requests] = (provider.submitBatch as ReturnType<typeof vi.fn>).mock
			.calls[0];
		expect((requests as { customId: string }[]).map((r) => r.customId)).toEqual(
			["chunk-0", "chunk-1", "chunk-2"]
		);
	});

	it("stays awaiting while the provider batch is still in progress", async () => {
		store.rows.push(store.row());
		const provider = fakeProvider({
			getBatchStatus: vi.fn(async () => ({
				providerBatchId: "msgbatch_1",
				processingStatus: "in_progress" as const,
				counts: {
					processing: 3,
					succeeded: 0,
					errored: 0,
					canceled: 0,
					expired: 0,
				},
			})),
		});

		const decision = await service(provider).resolveChunkOutputs(plan());

		expect(decision.status).toBe("awaiting");
		expect(provider.getBatchResults).not.toHaveBeenCalled();
	});

	it("maps ended results back onto chunk indexes regardless of arrival order", async () => {
		store.rows.push(store.row());
		const provider = fakeProvider({
			getBatchResults: vi.fn(async () => [
				{
					customId: "chunk-2",
					outcome: "succeeded" as const,
					text: payloadText("c2"),
					inputTokens: 10,
					outputTokens: 5,
				},
				{
					customId: "chunk-0",
					outcome: "succeeded" as const,
					text: payloadText("c0"),
					inputTokens: 10,
					outputTokens: 5,
				},
				{
					customId: "chunk-1",
					outcome: "succeeded" as const,
					text: payloadText("c1"),
					inputTokens: 10,
					outputTokens: 5,
				},
			]),
		});

		const decision = await service(provider).resolveChunkOutputs(plan());

		expect(decision.status).toBe("ready");
		if (decision.status !== "ready") return;
		expect([...decision.outputsByChunkIndex.keys()].sort()).toEqual([0, 1, 2]);
		const chunk0 = decision.outputsByChunkIndex.get(0) as {
			monsters: { name: string }[];
		};
		expect(chunk0.monsters[0].name).toBe("c0");
	});

	it("omits only the chunks that actually failed, so the rest are not re-run", async () => {
		store.rows.push(store.row());
		const provider = fakeProvider({
			getBatchResults: vi.fn(async () => [
				{
					customId: "chunk-0",
					outcome: "succeeded" as const,
					text: payloadText("c0"),
					inputTokens: 10,
					outputTokens: 5,
				},
				{
					customId: "chunk-1",
					outcome: "errored" as const,
					error: "overloaded_error: try again",
				},
				// Unparseable output also falls back rather than dropping entities.
				{
					customId: "chunk-2",
					outcome: "succeeded" as const,
					text: "I could not produce JSON.",
					inputTokens: 10,
					outputTokens: 5,
				},
			]),
		});

		const decision = await service(provider).resolveChunkOutputs(plan());

		expect(decision.status).toBe("ready");
		if (decision.status !== "ready") return;
		expect([...decision.outputsByChunkIndex.keys()]).toEqual([0]);
	});

	it("records batch token spend once, including cached input tokens", async () => {
		store.rows.push(store.row());
		const provider = fakeProvider({
			getBatchResults: vi.fn(async () => [
				{
					customId: "chunk-0",
					outcome: "succeeded" as const,
					text: payloadText("c0"),
					inputTokens: 100,
					outputTokens: 20,
					cachedInputTokens: 60,
					cacheWriteTokens: 15,
				},
				{
					customId: "chunk-1",
					outcome: "succeeded" as const,
					text: payloadText("c1"),
					inputTokens: 30,
					outputTokens: 10,
					cachedInputTokens: 20,
					cacheWriteTokens: 0,
				},
			]),
		});

		await service(provider).resolveChunkOutputs(plan());

		expect(recordBatchUsage).toHaveBeenCalledTimes(1);
		expect(recordBatchUsage).toHaveBeenCalledWith(
			"alice",
			160,
			"claude-sonnet-5",
			expect.objectContaining({ batchRequestCount: 3 })
		);
	});

	// Cost attribution prices output at ~5x input and cache reads at ~0.1x, and
	// stores an event unpriced when the split is missing. Recording only the
	// total would leave every batch out of the spend dashboard.
	it("passes the input/output split through so batch spend can be priced", async () => {
		store.rows.push(store.row());
		const provider = fakeProvider({
			getBatchResults: vi.fn(async () => [
				{
					customId: "chunk-0",
					outcome: "succeeded" as const,
					text: payloadText("c0"),
					inputTokens: 100,
					outputTokens: 20,
					cachedInputTokens: 60,
					cacheWriteTokens: 15,
				},
			]),
		});

		await service(provider).resolveChunkOutputs(plan());

		const meta = recordBatchUsage.mock.calls[0]?.[3] as Record<string, number>;
		// The three input lines partition inputTokens — no double counting.
		expect(meta.promptTokens).toBe(25);
		expect(meta.cachedInputTokens).toBe(60);
		expect(meta.cacheWriteTokens).toBe(15);
		expect(
			meta.promptTokens + meta.cachedInputTokens + meta.cacheWriteTokens
		).toBe(100);
		expect(meta.completionTokens).toBe(20);
	});

	it("falls back to inline when the batch has blown its deadline", async () => {
		store.rows.push(
			store.row({ deadline_at: new Date(Date.now() - 60_000).toISOString() })
		);
		const provider = fakeProvider();

		const decision = await service(provider).resolveChunkOutputs(plan());

		expect(decision.status).toBe("inline");
		expect(provider.cancelBatch).toHaveBeenCalledWith("msgbatch_1");
		expect(store.rows[0].status).toBe("expired");
	});

	it("discards a batch whose content fingerprint no longer matches", async () => {
		store.rows.push(store.row({ content_fingerprint: "stale-fingerprint" }));
		const provider = fakeProvider();

		const decision = await service(provider).resolveChunkOutputs(plan());

		expect(decision.status).toBe("inline");
		expect(store.rows[0].status).toBe("canceled");
	});

	it("discards a batch whose chunk window no longer matches the plan", async () => {
		store.rows.push(store.row({ chunk_window_end: 12, total_chunks: 12 }));

		const decision = await service(fakeProvider()).resolveChunkOutputs(plan());

		expect(decision.status).toBe("inline");
		expect(store.rows[0].status).toBe("canceled");
	});

	it("falls back to inline for a single-chunk run rather than paying batch latency", async () => {
		const provider = fakeProvider();

		const decision = await service(provider).resolveChunkOutputs(plan(1));

		expect(decision.status).toBe("inline");
		expect(provider.submitBatch).not.toHaveBeenCalled();
	});

	it("falls back to inline when the separate batch request budget is exhausted", async () => {
		checkBatchRequestBudget.mockResolvedValue({
			allowed: false,
			reason: "Batch request budget would be exceeded",
		});
		const provider = fakeProvider();

		const decision = await service(provider).resolveChunkOutputs(plan());

		expect(decision.status).toBe("inline");
		expect(provider.submitBatch).not.toHaveBeenCalled();
	});

	it("falls back to inline and frees the owner slot when submission fails", async () => {
		const provider = fakeProvider({
			submitBatch: vi.fn(async () => {
				throw new Error("529 overloaded");
			}),
		});

		const decision = await service(provider).resolveChunkOutputs(plan());

		expect(decision.status).toBe("inline");
		expect(store.rows[0].status).toBe("failed");
	});

	it("falls back to inline when the batch table has not been migrated", async () => {
		store.schemaReady = false;
		const provider = fakeProvider();

		const decision = await service(provider).resolveChunkOutputs(plan());

		expect(decision.status).toBe("inline");
		expect(provider.submitBatch).not.toHaveBeenCalled();
	});

	it("falls back to inline when polling throws, releasing the batch", async () => {
		store.rows.push(store.row());
		const provider = fakeProvider({
			getBatchStatus: vi.fn(async () => {
				throw new Error("404 not_found_error");
			}),
		});

		const decision = await service(provider).resolveChunkOutputs(plan());

		expect(decision.status).toBe("inline");
		expect(store.rows[0].status).toBe("failed");
	});

	it("sweeps a row abandoned mid-submit so its owner is not blocked forever", async () => {
		store.rows.push(
			store.row({
				status: "submitting",
				provider_batch_id: null,
				created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
			})
		);

		const decision = await service(fakeProvider()).resolveChunkOutputs(plan());

		expect(decision.status).toBe("inline");
		expect(store.rows[0].status).toBe("failed");
	});

	it("does not race an in-flight submit from a concurrent invocation", async () => {
		store.rows.push(
			store.row({ status: "submitting", provider_batch_id: null })
		);

		const decision = await service(fakeProvider()).resolveChunkOutputs(plan());

		expect(decision.status).toBe("awaiting");
		expect(store.rows[0].status).toBe("submitting");
	});

	// peekPendingBatch exists so a waiting tick can skip staging entirely —
	// staging front-loads character-sheet detection LLM calls that would
	// otherwise repeat on every poll for the life of the batch.
	describe("peekPendingBatch", () => {
		it("reports waiting without needing a chunk plan", async () => {
			store.rows.push(store.row());
			const provider = fakeProvider({
				getBatchStatus: vi.fn(async () => ({
					providerBatchId: "msgbatch_1",
					processingStatus: "in_progress" as const,
					counts: {
						processing: 3,
						succeeded: 0,
						errored: 0,
						canceled: 0,
						expired: 0,
					},
				})),
			});

			const pending = await service(provider).peekPendingBatch();

			expect(pending.waiting).toBe(true);
			expect(pending.chunkCount).toBe(3);
		});

		it("is not waiting when the batch has ended, so results get collected", async () => {
			store.rows.push(store.row());

			const pending = await service(fakeProvider()).peekPendingBatch();

			expect(pending.waiting).toBe(false);
		});

		it("is not waiting when there is no batch in flight", async () => {
			const provider = fakeProvider();

			const pending = await service(provider).peekPendingBatch();

			expect(pending.waiting).toBe(false);
			expect(provider.getBatchStatus).not.toHaveBeenCalled();
		});

		it("is not waiting past the deadline, so the fallback can run", async () => {
			store.rows.push(
				store.row({ deadline_at: new Date(Date.now() - 1000).toISOString() })
			);

			const pending = await service(fakeProvider()).peekPendingBatch();

			expect(pending.waiting).toBe(false);
		});

		it("is not waiting when the batch table is absent", async () => {
			store.schemaReady = false;

			const pending = await service(fakeProvider()).peekPendingBatch();

			expect(pending.waiting).toBe(false);
		});

		it("waits on a fresh submitting row but not a stale one", async () => {
			store.rows.push(
				store.row({ status: "submitting", provider_batch_id: "msgbatch_1" })
			);
			expect((await service(fakeProvider()).peekPendingBatch()).waiting).toBe(
				true
			);

			store.rows[0].created_at = new Date(
				Date.now() - 60 * 60 * 1000
			).toISOString();
			expect((await service(fakeProvider()).peekPendingBatch()).waiting).toBe(
				false
			);
		});

		it("defers to the full resolve when the status check throws", async () => {
			store.rows.push(store.row());
			const provider = fakeProvider({
				getBatchStatus: vi.fn(async () => {
					throw new Error("529 overloaded");
				}),
			});

			const pending = await service(provider).peekPendingBatch();

			expect(pending.waiting).toBe(false);
		});
	});

	it("reports awaiting status to the caller so progress UX can show it", async () => {
		const onStatus = vi.fn();
		const provider = fakeProvider();

		await service(provider, onStatus as never).resolveChunkOutputs(plan());

		expect(onStatus).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "awaiting", justSubmitted: true })
		);
	});
});

describe("cleanupStaleBatchJobs", () => {
	beforeEach(() => {
		store.rows = [];
		store.schemaReady = true;
	});

	it("is a no-op when the batch table is absent", async () => {
		store.schemaReady = false;

		const result = await cleanupStaleBatchJobs({ DB: {} } as never);

		expect(result).toEqual({ failedSubmitting: 0, expired: 0 });
	});

	it("fails rows abandoned mid-submit and expires rows past their deadline", async () => {
		store.rows.push(
			store.row({
				id: "abandoned",
				status: "submitting",
				provider_batch_id: null,
				created_at: "2020-01-01 00:00:00",
			}),
			store.row({
				id: "overdue",
				owner_key: "library/alice/other.pdf",
				deadline_at: "2020-01-01 00:00:00",
			})
		);

		const result = await cleanupStaleBatchJobs({ DB: {} } as never);

		expect(result).toEqual({ failedSubmitting: 1, expired: 1 });
		expect(store.rows.find((r) => r.id === "abandoned")?.status).toBe("failed");
		expect(store.rows.find((r) => r.id === "overdue")?.status).toBe("expired");
	});
});
