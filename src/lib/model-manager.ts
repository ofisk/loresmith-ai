import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { getGenerationModelForProvider, MODEL_CONFIG } from "@/app-constants";
import { sanitizeApiKey } from "./auth-utils";
import { LLMProviderAPIKeyError } from "./errors";

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
			throw new LLMProviderAPIKeyError("API key must be a non-empty string.");
		}

		const trimmedKey = sanitizeApiKey(apiKey);
		const provider = MODEL_CONFIG.PROVIDER.DEFAULT;

		// Validate that the API key is not a placeholder
		if (
			trimmedKey === "your-openai-api-key-here" ||
			trimmedKey === "your-anthropic-api-key-here"
		) {
			throw new LLMProviderAPIKeyError(
				"Invalid API key detected (placeholder value). Please provide a valid provider API key through the application authentication."
			);
		}

		if (this.apiKey === trimmedKey && this.model) {
			// Already initialized with the same key
			return;
		}

		// Create provider-aware model instance without mutating process environment.
		if (provider === "anthropic") {
			const anthropic = createAnthropic({ apiKey: trimmedKey });
			this.model = anthropic(
				getGenerationModelForProvider("INTERACTIVE", provider) as any
			);
		} else {
			const openAI = createOpenAI({ apiKey: trimmedKey });
			this.model = openAI(
				getGenerationModelForProvider("INTERACTIVE", provider) as any
			);
		}
		this.apiKey = trimmedKey;
	}

	/**
	 * Get the current model instance
	 */
	getModel(): any {
		if (!this.model) {
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
