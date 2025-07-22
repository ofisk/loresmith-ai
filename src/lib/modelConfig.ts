import { openai } from "@ai-sdk/openai";
import { MODEL_CONFIG } from "../constants";

/**
 * Simple centralized model configuration for Loresmith AI
 *
 * To change models, update the MODEL_CONFIG in src/constants.ts
 */

/**
 * Get the primary model for chat and general tasks
 */
export const getPrimaryModel = () => {
  // Check if API key is available in environment
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY not found in environment");
    throw new Error("OPENAI_API_KEY is required");
  }

  console.log("Creating primary model with API key available");
  return openai(MODEL_CONFIG.OPENAI.PRIMARY as any);
};

/**
 * Get the analysis model for metadata generation and analysis tasks
 */
export const getAnalysisModel = () => {
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
 */
export const getAnalysisModelWithDefaults = () => {
  return openai(MODEL_CONFIG.OPENAI.ANALYSIS as any);
};

/**
 * Get primary model with default chat parameters
 */
export const getPrimaryModelWithDefaults = () => {
  return openai(MODEL_CONFIG.OPENAI.PRIMARY as any);
};
