import { openai } from "@ai-sdk/openai";
import { MODEL_CONFIG } from "../constants";

/**
 * Simple centralized model configuration for Loresmith AI
 *
 * To change models, update the MODEL_CONFIG in src/constants.ts
 */

/**
 * Get the primary model for chat and general tasks
 * Note: This function requires an API key to be passed in since no default is configured
 */
export const getPrimaryModel = (apiKey?: string) => {
  // Check if API key is provided or available in environment
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("OpenAI API key not provided and no default key configured");
    throw new Error(
      "OpenAI API key is required - users must provide their own key"
    );
  }

  console.log("Creating primary model with API key available");
  return openai(MODEL_CONFIG.OPENAI.PRIMARY as any);
};

/**
 * Get the analysis model for metadata generation and analysis tasks
 * Note: This function requires an API key to be passed in since no default is configured
 */
export const getAnalysisModel = (apiKey?: string) => {
  // Check if API key is provided or available in environment
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("OpenAI API key not provided and no default key configured");
    throw new Error(
      "OpenAI API key is required - users must provide their own key"
    );
  }

  return openai(MODEL_CONFIG.OPENAI.ANALYSIS as any);
};

/**
 * Get model with custom parameters
 */
export const getModelWithParams = (
  modelName: string,
  params: Record<string, any>
) => {
  return openai(modelName as any, params);
};

/**
 * Get analysis model with default analysis parameters
 * Note: This function requires an API key to be passed in since no default is configured
 */
export const getAnalysisModelWithDefaults = (apiKey?: string) => {
  // Check if API key is provided or available in environment
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("OpenAI API key not provided and no default key configured");
    throw new Error(
      "OpenAI API key is required - users must provide their own key"
    );
  }

  return openai(MODEL_CONFIG.OPENAI.ANALYSIS as any);
};

/**
 * Get primary model with default chat parameters
 * Note: This function requires an API key to be passed in since no default is configured
 */
export const getPrimaryModelWithDefaults = (apiKey?: string) => {
  // Check if API key is provided or available in environment
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("OpenAI API key not provided and no default key configured");
    throw new Error(
      "OpenAI API key is required - users must provide their own key"
    );
  }

  return openai(MODEL_CONFIG.OPENAI.PRIMARY as any);
};
