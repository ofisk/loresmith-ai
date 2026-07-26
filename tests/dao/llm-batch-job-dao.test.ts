import { describe, expect, it } from "vitest";
import { LlmBatchJobDAO } from "@/dao/llm-batch-job-dao";
import type { LlmBatchJobRow } from "@/types/llm-batch";

function row(requests: string): LlmBatchJobRow {
	return {
		id: "job-1",
		provider: "anthropic",
		provider_batch_id: "msgbatch_1",
		owner_kind: "library_entity_discovery",
		owner_key: "library/alice/f.pdf",
		username: "alice",
		model: "claude-sonnet-5",
		status: "in_progress",
		request_count: 2,
		succeeded_count: 0,
		errored_count: 0,
		requests,
		content_fingerprint: null,
		chunk_window_start: 0,
		chunk_window_end: 2,
		total_chunks: 2,
		deadline_at: "2026-07-26 10:00:00",
		last_polled_at: null,
		poll_count: 0,
		input_tokens: 0,
		output_tokens: 0,
		last_error: null,
		created_at: "2026-07-26 09:00:00",
		updated_at: "2026-07-26 09:00:00",
		completed_at: null,
	};
}

describe("LlmBatchJobDAO.parseRequests", () => {
	it("parses the stored custom_id → chunk index mapping", () => {
		expect(
			LlmBatchJobDAO.parseRequests(
				row(
					JSON.stringify([
						{ customId: "chunk-0", chunkIndex: 0 },
						{ customId: "chunk-7", chunkIndex: 7 },
					])
				)
			)
		).toEqual([
			{ customId: "chunk-0", chunkIndex: 0 },
			{ customId: "chunk-7", chunkIndex: 7 },
		]);
	});

	it("drops malformed entries rather than mapping a result to the wrong chunk", () => {
		expect(
			LlmBatchJobDAO.parseRequests(
				row(
					JSON.stringify([
						{ customId: "chunk-0", chunkIndex: 0 },
						{ customId: "chunk-1" },
						{ chunkIndex: 2 },
						{ customId: "chunk-3", chunkIndex: 1.5 },
						null,
					])
				)
			)
		).toEqual([{ customId: "chunk-0", chunkIndex: 0 }]);
	});

	it("returns an empty list for unreadable JSON instead of throwing", () => {
		expect(LlmBatchJobDAO.parseRequests(row("{not json"))).toEqual([]);
		expect(LlmBatchJobDAO.parseRequests(row('"a string"'))).toEqual([]);
	});
});
