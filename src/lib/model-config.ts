import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { getGenerationModelForProvider, MODEL_CONFIG } from "../app-constants";
import { LLMProviderAPIKeyError } from "./errors";

/**
 * Centralized model configuration for Loresmith AI
 *
 * This module provides a unified interface for creating OpenAI models
 * with consistent API key validation and error handling.
 */

/**
 * Validate that an API key is available
 */
function validateApiKey(apiKey?: string): string {
	if (!apiKey) {
		console.error("LLM API key not provided");
		throw new LLMProviderAPIKeyError(
			`${
				MODEL_CONFIG.PROVIDER.DEFAULT === "anthropic" ? "Anthropic" : "OpenAI"
			} API key is required. Configure ${
				MODEL_CONFIG.PROVIDER.DEFAULT === "anthropic"
					? "ANTHROPIC_API_KEY"
					: "OPENAI_API_KEY"
			} on the server (or provide a user key).`
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
	params: Record<string, any> = {},
	provider: "openai" | "anthropic" = MODEL_CONFIG.PROVIDER.DEFAULT
) {
	const validatedApiKey = validateApiKey(apiKey);
	if (provider === "anthropic") {
		const anthropic = createAnthropic({ apiKey: validatedApiKey });
		void params;
		return anthropic(modelName as any);
	}
	const openAI = createOpenAI({ apiKey: validatedApiKey });
	void params;
	return openAI(modelName as any);
}

/**
 * Get the primary model for chat and general tasks
 */
export function getPrimaryModel(apiKey?: string) {
	return createModel(getGenerationModelForProvider("INTERACTIVE"), apiKey);
}

/**
 * Get the analysis model for metadata generation and analysis tasks
 */
export function getAnalysisModel(apiKey?: string) {
	return createModel(getGenerationModelForProvider("ANALYSIS"), apiKey);
}

/**
 * Get the embedding model for vector operations
 */
export function getEmbeddingModel(apiKey?: string) {
	return createModel(MODEL_CONFIG.OPENAI.EMBEDDINGS, apiKey, {}, "openai");
}

/**
 * Get model with custom parameters
 */
export function getModelWithParams(
	modelName: string,
	params: Record<string, any>,
	apiKey?: string
) {
	return createModel(modelName, apiKey, params);
}

// Legacy exports for backward compatibility
export const getAnalysisModelWithDefaults = getAnalysisModel;
export const getPrimaryModelWithDefaults = getPrimaryModel;
