import { openai } from "@ai-sdk/openai";
import { MODEL_CONFIG } from "../app-constants";
import { OpenAIAPIKeyError } from "./errors";

export class ModelManager {
  private static instance: ModelManager;
  private model: any = null;
  private apiKey: string | null = null;

  private constructor() {}

  static getInstance(): ModelManager {
    if (!ModelManager.instance) {
      ModelManager.instance = new ModelManager();
    }
    return ModelManager.instance;
  }

  /**
   * Initialize the model with a user's API key
   */
  initializeModel(apiKey: string): void {
    if (!apiKey || typeof apiKey !== "string") {
      throw new OpenAIAPIKeyError("API key must be a non-empty string");
    }

    const trimmedKey = apiKey.trim();

    // Validate that the API key is not a placeholder
    if (trimmedKey === "your-openai-api-key-here") {
      throw new OpenAIAPIKeyError(
        "Invalid OpenAI API key detected (placeholder value). Please provide a valid OpenAI API key through the application authentication."
      );
    }

    if (this.apiKey === trimmedKey && this.model) {
      // Already initialized with the same key
      return;
    }

    // Set the API key in the environment for the model creation
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = trimmedKey;

    try {
      // Create the model instance
      this.model = openai(MODEL_CONFIG.OPENAI.PRIMARY as any);
      this.apiKey = trimmedKey;

      console.log("[ModelManager] Model initialized with user API key");
    } catch (error) {
      // Restore the original API key if there was an error
      if (originalApiKey === undefined) {
        delete (process.env as any).OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
      throw error;
    }
  }

  /**
   * Get the current model instance
   */
  getModel(): any {
    if (!this.model) {
      // No auto-initialization - users must authenticate through the app
      console.log(
        "[ModelManager] No model initialized - user must authenticate through the application"
      );
      return null;
    }
    return this.model;
  }

  /**
   * Check if the model is initialized
   */
  isInitialized(): boolean {
    return this.model !== null;
  }

  /**
   * Get the current API key
   */
  getApiKey(): string | null {
    return this.apiKey;
  }

  /**
   * Clear the model instance (useful for testing or when switching users)
   */
  clearModel(): void {
    this.model = null;
    this.apiKey = null;
  }
}
