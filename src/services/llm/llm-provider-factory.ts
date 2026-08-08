import { AnthropicProvider } from "./anthropic-provider";
import type { LLMProvider } from "./llm-provider";

export type ProviderType = "anthropic";

export interface LLMProviderFactoryOptions {
	provider?: ProviderType;
	apiKey: string;
	defaultModel?: string;
	defaultTemperature?: number;
	defaultMaxTokens?: number;
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
	});
}
