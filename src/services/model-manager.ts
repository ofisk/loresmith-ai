import { openai } from "@ai-sdk/openai";
import { MODEL_CONFIG } from "../constants";

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
    if (this.apiKey === apiKey && this.model) {
      // Already initialized with the same key
      return;
    }

    // Set the API key in the environment for the model creation
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = apiKey;

    try {
      // Create the model instance
      this.model = openai(MODEL_CONFIG.OPENAI.PRIMARY as any);
      this.apiKey = apiKey;

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
      // Auto-initialize with a default API key if not already initialized
      const defaultApiKey = process.env.OPENAI_API_KEY;
      if (!defaultApiKey) {
        // In production, users provide their own API keys, so this is expected
        // Return null to indicate no model is available yet
        console.log(
          "[ModelManager] No default API key found - user must provide their own key"
        );
        return null;
      }
      console.log(
        "[ModelManager] Auto-initializing model with default API key"
      );
      this.initializeModel(defaultApiKey);
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
   * Check if we can auto-initialize with a default API key
   */
  canAutoInitialize(): boolean {
    return !this.isInitialized() && !!process.env.OPENAI_API_KEY;
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
