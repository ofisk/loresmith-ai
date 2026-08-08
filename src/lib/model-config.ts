import { createAnthropic } from "@ai-sdk/anthropic";
import { LLMProviderAPIKeyError } from "./errors";

/**
 * Centralized model configuration for Loresmith AI
 *
 * This module provides a unified interface for creating Anthropic models
 * with consistent API key validation and error handling.
 */

/**
 * Validate that an API key is available
 */
function validateApiKey(apiKey?: string): string {
	if (!apiKey) {
		throw new LLMProviderAPIKeyError(
			"Anthropic API key is required. Configure ANTHROPIC_API_KEY on the server (or provide a user key)."
		);
	}
	return apiKey;
}

/**
 * Create a model with the specified configuration
 */
export function createModel(
	modelName: string,
	apiKey?: string,
	params: Record<string, any> = {}
) {
	const validatedApiKey = validateApiKey(apiKey);
	const anthropic = createAnthropic({ apiKey: validatedApiKey });
	void params;
	return anthropic(modelName as any);
}
