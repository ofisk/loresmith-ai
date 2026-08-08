import type { TextGenerationTier } from "@/app-constants";
import { AnthropicProvider } from "./anthropic-provider";
import type { LLMProvider } from "./llm-provider";

export type ProviderType = "anthropic";

export interface LLMProviderFactoryOptions {
	provider?: ProviderType;
	apiKey: string;
	defaultModel?: string;
	defaultTemperature?: number;
	defaultMaxTokens?: number;
	/**
	 * Tier every call from this provider belongs to, when the caller builds one
	 * provider per tier — which is the common shape here, since `defaultModel` is
	 * almost always `getGenerationModelForProvider(tier)`.
	 *
	 * Sets the Anthropic effort level (`effortForTier`) and tags spend with
	 * `modelRole`. Omitting it preserves today's behaviour exactly.
	 */
	defaultTier?: TextGenerationTier;
}

/**
 * Factory function to create the LLM provider
 */
export function createLLMProvider(
	options: LLMProviderFactoryOptions
): LLMProvider {
	return new AnthropicProvider(options.apiKey, {
		defaultModel: options.defaultModel,
		defaultTemperature: options.defaultTemperature,
		defaultMaxTokens: options.defaultMaxTokens,
		defaultTier: options.defaultTier,
	});
}
