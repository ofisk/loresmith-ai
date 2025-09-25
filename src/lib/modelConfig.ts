import { openai } from "@ai-sdk/openai";
import { MODEL_CONFIG } from "../app-constants";

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
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("OpenAI API key not provided and no default key configured");
    throw new Error(
      "OpenAI API key is required - users must provide their own key"
    );
  }
  return key;
}

/**
 * Create a model with the specified configuration
 */
export function createModel(
  modelName: string,
  apiKey?: string,
  params: Record<string, any> = {}
) {
  validateApiKey(apiKey);
  return openai(modelName as any, params);
}

/**
 * Get the primary model for chat and general tasks
 */
export function getPrimaryModel(apiKey?: string) {
  return createModel(MODEL_CONFIG.OPENAI.PRIMARY, apiKey);
}

/**
 * Get the analysis model for metadata generation and analysis tasks
 */
export function getAnalysisModel(apiKey?: string) {
  return createModel(MODEL_CONFIG.OPENAI.ANALYSIS, apiKey);
}

/**
 * Get the embedding model for vector operations
 */
export function getEmbeddingModel(apiKey?: string) {
  return createModel(MODEL_CONFIG.OPENAI.EMBEDDINGS, apiKey);
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
