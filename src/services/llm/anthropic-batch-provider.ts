import type Anthropic from "@anthropic-ai/sdk";
import { anthropicBatchModelParams } from "@/lib/anthropic-model-options";
import { LLMProviderAPIKeyError } from "@/lib/errors";
import { describeLlmFailure, wrapLlmError } from "@/lib/llm-error-utils";
import type {
	LLMBatchProvider,
	LlmBatchProcessingStatus,
	LlmBatchRequestInput,
	LlmBatchResultEntry,
	LlmBatchStatusResult,
	LlmBatchSubmitResult,
} from "@/types/llm-batch";

/** Anthropic hard limits on a single batch (`POST /v1/messages/batches`). */
export const ANTHROPIC_BATCH_MAX_REQUESTS = 100_000;
export const ANTHROPIC_BATCH_MAX_BYTES = 256 * 1024 * 1024;

/**
 * Batch submission path for Anthropic, alongside the synchronous
 * {@link import("./anthropic-provider").AnthropicProvider}.
 *
 * The synchronous path goes through the AI SDK (`@ai-sdk/anthropic`), which has
 * no batches support, so this uses the official `@anthropic-ai/sdk` — notably
 * for decoding the JSONL results stream. The SDK is imported lazily so it stays
 * out of the hot request path's module graph.
 */
export class AnthropicBatchProvider implements LLMBatchProvider {
	private client: Anthropic | null = null;

	constructor(private readonly apiKey: string) {
		if (!apiKey) {
			throw new LLMProviderAPIKeyError(
				"Anthropic API key is required for batch submission. Configure ANTHROPIC_API_KEY on the server."
			);
		}
	}

	private async getClient(): Promise<Anthropic> {
		if (!this.client) {
			const { default: AnthropicSdk } = await import("@anthropic-ai/sdk");
			this.client = new AnthropicSdk({ apiKey: this.apiKey });
		}
		return this.client;
	}

	/**
	 * Submits one batch. `cacheablePrefix` is marked `ephemeral` so the shared
	 * extraction instructions are cached across every request in the batch, the
	 * same split the synchronous structured path uses.
	 */
	async submitBatch(
		requests: LlmBatchRequestInput[],
		options: { model: string; schema?: string }
	): Promise<LlmBatchSubmitResult> {
		if (requests.length === 0) {
			throw new Error("Cannot submit an empty batch");
		}
		if (requests.length > ANTHROPIC_BATCH_MAX_REQUESTS) {
			throw new Error(
				`Batch exceeds Anthropic's ${ANTHROPIC_BATCH_MAX_REQUESTS} request limit (${requests.length})`
			);
		}

		const seen = new Set<string>();
		for (const request of requests) {
			if (seen.has(request.customId)) {
				throw new Error(`Duplicate batch custom_id: ${request.customId}`);
			}
			seen.add(request.customId);
		}

		try {
			const client = await this.getClient();
			const modelParams = anthropicBatchModelParams(options.model);
			const batch = await client.messages.batches.create({
				requests: requests.map((request) => ({
					custom_id: request.customId,
					params: {
						model: options.model,
						max_tokens: request.maxTokens,
						...modelParams,
						messages: [
							{
								role: "user" as const,
								content: [
									{
										type: "text" as const,
										text: request.cacheablePrefix,
										cache_control: { type: "ephemeral" as const },
									},
									{ type: "text" as const, text: request.variableSuffix },
								],
							},
						],
					},
				})),
			});

			return {
				providerBatchId: batch.id,
				requestCount: requests.length,
			};
		} catch (error) {
			throw wrapLlmError(
				`Failed to submit Anthropic message batch: ${describeLlmFailure(error)}`,
				error
			);
		}
	}

	async getBatchStatus(providerBatchId: string): Promise<LlmBatchStatusResult> {
		try {
			const client = await this.getClient();
			const batch = await client.messages.batches.retrieve(providerBatchId);
			return {
				providerBatchId: batch.id,
				processingStatus: batch.processing_status as LlmBatchProcessingStatus,
				counts: {
					processing: batch.request_counts.processing,
					succeeded: batch.request_counts.succeeded,
					errored: batch.request_counts.errored,
					canceled: batch.request_counts.canceled,
					expired: batch.request_counts.expired,
				},
			};
		} catch (error) {
			throw wrapLlmError(
				`Failed to retrieve Anthropic message batch ${providerBatchId}: ${describeLlmFailure(error)}`,
				error
			);
		}
	}

	/**
	 * Streams the JSONL results. Entries come back in arbitrary order, so the
	 * caller must key on `customId` rather than position.
	 */
	async getBatchResults(
		providerBatchId: string
	): Promise<LlmBatchResultEntry[]> {
		try {
			const client = await this.getClient();
			const entries: LlmBatchResultEntry[] = [];

			for await (const result of await client.messages.batches.results(
				providerBatchId
			)) {
				const customId = result.custom_id;
				if (result.result.type === "succeeded") {
					const message = result.result.message;
					const text = message.content
						.filter(
							(block): block is Anthropic.TextBlock => block.type === "text"
						)
						.map((block) => block.text)
						.join("");
					// `input_tokens` is the uncached remainder only — cache creation and
					// cache read tokens are billed separately and must be added in, or
					// batch spend is under-reported for every request after the first
					// (which all read the shared cached prefix). They are also reported
					// separately, because each prices at a different rate.
					const cacheWriteTokens =
						message.usage.cache_creation_input_tokens ?? 0;
					const cachedInputTokens = message.usage.cache_read_input_tokens ?? 0;
					entries.push({
						customId,
						outcome: "succeeded",
						text,
						inputTokens:
							(message.usage.input_tokens ?? 0) +
							cacheWriteTokens +
							cachedInputTokens,
						outputTokens: message.usage.output_tokens ?? 0,
						cachedInputTokens,
						cacheWriteTokens,
					});
					continue;
				}
				entries.push({
					customId,
					outcome: result.result.type,
					error: describeBatchResultError(result.result),
				});
			}

			return entries;
		} catch (error) {
			throw wrapLlmError(
				`Failed to read Anthropic message batch results ${providerBatchId}: ${describeLlmFailure(error)}`,
				error
			);
		}
	}

	async cancelBatch(providerBatchId: string): Promise<void> {
		try {
			const client = await this.getClient();
			await client.messages.batches.cancel(providerBatchId);
		} catch (error) {
			throw wrapLlmError(
				`Failed to cancel Anthropic message batch ${providerBatchId}: ${describeLlmFailure(error)}`,
				error
			);
		}
	}
}

function describeBatchResultError(result: {
	type: string;
	error?: unknown;
}): string {
	if (result.type === "errored" && result.error) {
		const wrapper = result.error as {
			error?: { type?: string; message?: string };
		};
		const inner = wrapper.error;
		if (inner?.type || inner?.message) {
			return `${inner.type ?? "error"}: ${inner.message ?? "unknown"}`;
		}
		return JSON.stringify(result.error);
	}
	return result.type;
}
