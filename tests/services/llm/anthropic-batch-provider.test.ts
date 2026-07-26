import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ANTHROPIC_BATCH_MAX_REQUESTS,
	AnthropicBatchProvider,
} from "@/services/llm/anthropic-batch-provider";
import type { LlmBatchRequestInput } from "@/types/llm-batch";

const create = vi.fn();
const retrieve = vi.fn();
const results = vi.fn();
const cancel = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
	default: class {
		messages = { batches: { create, retrieve, results, cancel } };
		constructor(public opts: unknown) {}
	},
}));

function request(
	customId: string,
	overrides: Partial<LlmBatchRequestInput> = {}
): LlmBatchRequestInput {
	return {
		customId,
		cacheablePrefix: "shared instructions",
		variableSuffix: `body of ${customId}`,
		maxTokens: 16384,
		...overrides,
	};
}

describe("AnthropicBatchProvider", () => {
	beforeEach(() => {
		create.mockReset().mockResolvedValue({ id: "msgbatch_abc" });
		retrieve.mockReset();
		results.mockReset();
		cancel.mockReset().mockResolvedValue(undefined);
	});

	it("requires an API key", () => {
		expect(() => new AnthropicBatchProvider("")).toThrow(/API key is required/);
	});

	it("submits one request per input, keyed by custom_id", async () => {
		const provider = new AnthropicBatchProvider("sk-test");

		const result = await provider.submitBatch(
			[request("chunk-0"), request("chunk-1")],
			{ model: "claude-sonnet-5" }
		);

		expect(result).toEqual({
			providerBatchId: "msgbatch_abc",
			requestCount: 2,
		});
		const body = create.mock.calls[0][0];
		expect(
			body.requests.map((r: { custom_id: string }) => r.custom_id)
		).toEqual(["chunk-0", "chunk-1"]);
	});

	it("marks the shared prefix ephemeral and leaves the per-chunk suffix uncached", async () => {
		const provider = new AnthropicBatchProvider("sk-test");

		await provider.submitBatch([request("chunk-0")], {
			model: "claude-sonnet-5",
		});

		const [content] = create.mock.calls[0][0].requests.map(
			(r: { params: { messages: { content: unknown[] }[] } }) =>
				r.params.messages[0].content
		);
		expect(content[0]).toMatchObject({
			text: "shared instructions",
			cache_control: { type: "ephemeral" },
		});
		expect(content[1]).toEqual({
			type: "text",
			text: "body of chunk-0",
		});
	});

	it("sends effort instead of temperature on Sonnet 5", async () => {
		const provider = new AnthropicBatchProvider("sk-test");

		await provider.submitBatch([request("chunk-0")], {
			model: "claude-sonnet-5",
		});

		const params = create.mock.calls[0][0].requests[0].params;
		expect(params.output_config).toEqual({ effort: "medium" });
		expect(params.temperature).toBeUndefined();
	});

	it("rejects an empty batch", async () => {
		const provider = new AnthropicBatchProvider("sk-test");
		await expect(provider.submitBatch([], { model: "m" })).rejects.toThrow(
			/empty batch/
		);
	});

	it("rejects duplicate custom_ids, which would make results unmappable", async () => {
		const provider = new AnthropicBatchProvider("sk-test");
		await expect(
			provider.submitBatch([request("chunk-0"), request("chunk-0")], {
				model: "m",
			})
		).rejects.toThrow(/Duplicate batch custom_id/);
	});

	it("rejects a batch above Anthropic's request ceiling", async () => {
		const provider = new AnthropicBatchProvider("sk-test");
		const tooMany = Array.from(
			{ length: ANTHROPIC_BATCH_MAX_REQUESTS + 1 },
			(_, i) => request(`chunk-${i}`)
		);
		await expect(provider.submitBatch(tooMany, { model: "m" })).rejects.toThrow(
			/request limit/
		);
	});

	it("reports processing status and counts", async () => {
		retrieve.mockResolvedValue({
			id: "msgbatch_abc",
			processing_status: "in_progress",
			request_counts: {
				processing: 2,
				succeeded: 1,
				errored: 0,
				canceled: 0,
				expired: 0,
			},
		});
		const provider = new AnthropicBatchProvider("sk-test");

		const status = await provider.getBatchStatus("msgbatch_abc");

		expect(status.processingStatus).toBe("in_progress");
		expect(status.counts.succeeded).toBe(1);
	});

	it("sums uncached, cache-write and cache-read input tokens", async () => {
		results.mockResolvedValue([
			{
				custom_id: "chunk-0",
				result: {
					type: "succeeded",
					message: {
						content: [{ type: "text", text: '{"ok":true}' }],
						usage: {
							input_tokens: 10,
							cache_creation_input_tokens: 100,
							cache_read_input_tokens: 1000,
							output_tokens: 7,
						},
					},
				},
			},
		]);
		const provider = new AnthropicBatchProvider("sk-test");

		const entries = await provider.getBatchResults("msgbatch_abc");

		expect(entries).toEqual([
			{
				customId: "chunk-0",
				outcome: "succeeded",
				text: '{"ok":true}',
				inputTokens: 1110,
				outputTokens: 7,
				// Reported separately as well as summed: cache reads price at ~0.1x
				// and cache writes at ~1.25x the uncached input rate.
				cachedInputTokens: 1000,
				cacheWriteTokens: 100,
			},
		]);
	});

	it("concatenates multiple text blocks and ignores non-text blocks", async () => {
		results.mockResolvedValue([
			{
				custom_id: "chunk-0",
				result: {
					type: "succeeded",
					message: {
						content: [
							{ type: "thinking", thinking: "" },
							{ type: "text", text: '{"a":1' },
							{ type: "text", text: "}" },
						],
						usage: { input_tokens: 1, output_tokens: 1 },
					},
				},
			},
		]);
		const provider = new AnthropicBatchProvider("sk-test");

		const entries = await provider.getBatchResults("msgbatch_abc");

		expect(entries[0]).toMatchObject({ text: '{"a":1}' });
	});

	it("surfaces errored, expired and canceled outcomes with a reason", async () => {
		results.mockResolvedValue([
			{
				custom_id: "chunk-0",
				result: {
					type: "errored",
					error: { error: { type: "overloaded_error", message: "busy" } },
				},
			},
			{ custom_id: "chunk-1", result: { type: "expired" } },
			{ custom_id: "chunk-2", result: { type: "canceled" } },
		]);
		const provider = new AnthropicBatchProvider("sk-test");

		const entries = await provider.getBatchResults("msgbatch_abc");

		expect(entries[0]).toEqual({
			customId: "chunk-0",
			outcome: "errored",
			error: "overloaded_error: busy",
		});
		expect(entries[1]).toMatchObject({ outcome: "expired" });
		expect(entries[2]).toMatchObject({ outcome: "canceled" });
	});

	it("wraps provider failures with context", async () => {
		create.mockRejectedValue(new Error("529 overloaded"));
		const provider = new AnthropicBatchProvider("sk-test");

		await expect(
			provider.submitBatch([request("chunk-0")], { model: "m" })
		).rejects.toThrow(/Failed to submit Anthropic message batch/);
	});

	it("cancels a batch", async () => {
		const provider = new AnthropicBatchProvider("sk-test");
		await provider.cancelBatch("msgbatch_abc");
		expect(cancel).toHaveBeenCalledWith("msgbatch_abc");
	});
});
