import type { LlmUsageReport } from "@/lib/llm-usage-breakdown";

/**
 * Usage callback for recording LLM token/query usage (rate limiting, analytics)
 */
export interface UsageCallbackContext {
	username?: string;
	model?: string;
}

/**
 * Options for LLM generation
 */
export interface LLMOptions {
	model?: string;
	temperature?: number;
	maxTokens?: number;
	/**
	 * AI SDK generateText retries (default 2 → 3 total attempts).
	 * Session readout passes a higher value for transient overload.
	 */
	maxRetries?: number;
	/** Wall-clock timeout for the provider call (ms), or AI SDK timeout shape. */
	timeout?: number | { totalMs?: number; stepMs?: number };
	/** Username for rate limit attribution (passed to onUsage context) */
	username?: string;
	/**
	 * Callback invoked after generation with token and query counts (for rate
	 * limiting). `usage` also carries the input/output/cached split when the
	 * provider reports it, which cost attribution needs to price the call.
	 */
	onUsage?: (
		usage: LlmUsageReport,
		context?: UsageCallbackContext
	) => void | Promise<void>;
	/**
	 * When set (Anthropic), uses message parts + an ephemeral cache breakpoint on
	 * the prefix.
	 *
	 * Lives on `LLMOptions`, not `StructuredOutputOptions`, so plain-text
	 * generation can cache too — several long prompts in this repo are a large
	 * stable instruction block followed by variable campaign data, and the
	 * parent type is what `generateSummary` accepts.
	 *
	 * The prefix must clear the model's minimum cacheable length or the API
	 * silently drops the breakpoint; see `lib/prompt-cache-guard.ts`.
	 */
	structuredPromptParts?: StructuredPromptParts;
}

/**
 * Split prompt for Anthropic prompt caching: identical `cacheablePrefix` across
 * calls (cached); `variableSuffix` carries the per-call content.
 */
export interface StructuredPromptParts {
	cacheablePrefix: string;
	variableSuffix: string;
}

/**
 * Options for structured output generation
 */
export interface StructuredOutputOptions extends LLMOptions {
	schema?: string; // JSON schema as string for structured output
	/** Invoked when a JSON repair pass runs after first-pass parse failure. */
	onJsonRepair?: () => void | Promise<void>;
}

/**
 * Interface for LLM providers
 * Allows plugging in different LLM providers (OpenAI, Anthropic, etc.)
 */
export interface LLMProvider {
	/**
	 * Generate a summary from a prompt
	 * @param prompt - The prompt to generate from
	 * @param options - Optional configuration for the generation
	 * @returns The generated text
	 */
	generateSummary(prompt: string, options?: LLMOptions): Promise<string>;

	/**
	 * Generate structured output from a prompt
	 * @param prompt - The prompt to generate from
	 * @param options - Optional configuration including schema
	 * @returns The generated structured object (parsed JSON)
	 */
	generateStructuredOutput<T = unknown>(
		prompt: string,
		options?: StructuredOutputOptions
	): Promise<T>;
}
