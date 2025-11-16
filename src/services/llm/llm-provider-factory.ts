import type { LLMProvider } from "./llm-provider";
import { OpenAIProvider } from "./openai-provider";

export type ProviderType = "openai" | "anthropic";

export interface LLMProviderFactoryOptions {
  provider?: ProviderType;
  apiKey: string;
  defaultModel?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
}

/**
 * Factory function to create appropriate LLM provider
 */
export function createLLMProvider(
  options: LLMProviderFactoryOptions
): LLMProvider {
  const providerType = options.provider || "openai";

  switch (providerType) {
    case "openai":
      return new OpenAIProvider(options.apiKey, {
        defaultModel: options.defaultModel,
        defaultTemperature: options.defaultTemperature,
        defaultMaxTokens: options.defaultMaxTokens,
      });
    case "anthropic":
      // Future implementation
      throw new Error("Anthropic provider not yet implemented");
    default:
      throw new Error(`Unknown provider type: ${providerType}`);
  }
}
