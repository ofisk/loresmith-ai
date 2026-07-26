/**
 * Types for the Anthropic Message Batches path used by queue-driven pipeline
 * work (issue #735).
 *
 * Batch pricing is a large discount on exactly the workload this app already
 * runs asynchronously: entity extraction behind a queue, where the user is
 * notified when indexing completes and latency of minutes is expected.
 */

/** Pipeline job kinds that can own a batch. */
export const LLM_BATCH_OWNER_KIND = {
	library_entity_discovery: "library_entity_discovery",
} as const;

export type LlmBatchOwnerKind =
	(typeof LLM_BATCH_OWNER_KIND)[keyof typeof LLM_BATCH_OWNER_KIND];

/**
 * `submitting` exists so a crashed submit cannot leave an orphan row that
 * blocks the owner forever — it is swept by the stale-batch cleanup.
 * `collected`, `failed`, `expired`, `canceled` are terminal.
 */
export type LlmBatchStatus =
	| "submitting"
	| "in_progress"
	| "collected"
	| "failed"
	| "expired"
	| "canceled";

/** One request inside a batch, mapped back to the chunk it came from. */
export interface LlmBatchRequestRef {
	customId: string;
	chunkIndex: number;
}

export interface LlmBatchJobRow {
	id: string;
	provider: string;
	provider_batch_id: string | null;
	owner_kind: string;
	owner_key: string;
	username: string;
	model: string;
	status: LlmBatchStatus;
	request_count: number;
	succeeded_count: number;
	errored_count: number;
	/** JSON array of {@link LlmBatchRequestRef}. */
	requests: string;
	content_fingerprint: string | null;
	chunk_window_start: number | null;
	chunk_window_end: number | null;
	total_chunks: number | null;
	deadline_at: string;
	last_polled_at: string | null;
	poll_count: number;
	input_tokens: number;
	output_tokens: number;
	last_error: string | null;
	created_at: string;
	updated_at: string;
	completed_at: string | null;
}

/** A single prompt to send as one request in a batch. */
export interface LlmBatchRequestInput {
	customId: string;
	/** Stable prefix eligible for prompt caching (identical across requests). */
	cacheablePrefix: string;
	/** Per-request suffix (the document chunk). */
	variableSuffix: string;
	maxTokens: number;
}

export interface LlmBatchSubmitResult {
	providerBatchId: string;
	requestCount: number;
}

export type LlmBatchProcessingStatus = "in_progress" | "ended" | "canceling";

export interface LlmBatchStatusResult {
	providerBatchId: string;
	processingStatus: LlmBatchProcessingStatus;
	counts: {
		processing: number;
		succeeded: number;
		errored: number;
		canceled: number;
		expired: number;
	};
}

/**
 * One decoded batch result. `succeeded` carries the model's raw text; the
 * caller parses it with the same JSON extraction the synchronous path uses so
 * both paths agree on malformed-output handling.
 */
export type LlmBatchResultEntry =
	| {
			customId: string;
			outcome: "succeeded";
			text: string;
			/** All input tokens: uncached + cache-write + cache-read. */
			inputTokens: number;
			outputTokens: number;
			/**
			 * Cache-read and cache-write shares of `inputTokens`, kept separate
			 * because they price differently (~0.1x and ~1.25x the input rate).
			 * Folding them into one figure would misprice every batch after the
			 * first, which reads a warm prefix.
			 */
			cachedInputTokens: number;
			cacheWriteTokens: number;
	  }
	| {
			customId: string;
			outcome: "errored" | "canceled" | "expired";
			error: string;
	  };

/**
 * Batch submission surface on the provider layer, alongside the synchronous
 * `generateStructuredOutput` / `generateSummary` methods on {@link
 * import("@/services/llm/llm-provider").LLMProvider}.
 */
export interface LLMBatchProvider {
	submitBatch(
		requests: LlmBatchRequestInput[],
		options: { model: string; schema?: string }
	): Promise<LlmBatchSubmitResult>;

	getBatchStatus(providerBatchId: string): Promise<LlmBatchStatusResult>;

	/** Results arrive in arbitrary order — always key by `customId`. */
	getBatchResults(providerBatchId: string): Promise<LlmBatchResultEntry[]>;

	cancelBatch(providerBatchId: string): Promise<void>;
}
