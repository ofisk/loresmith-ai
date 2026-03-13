import type { D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import { DatabaseUtils } from "@/lib/db-utils";
import { getEnvVar } from "@/lib/env-utils";
import {
	DatabaseConnectionError,
	EmbeddingGenerationError,
	LLMProviderAPIKeyError,
	VectorizeIndexRequiredError,
} from "@/lib/errors";
import { ProviderEmbeddingService } from "@/services/embedding/provider-embedding-service";

/**
 * Base RAG Service that provides shared functionality for different RAG implementations.
 *
 * This base class handles:
 * - Text chunking with configurable parameters
 * - Embedding generation using OpenAI
 * - Common database operations
 * - Shared utility methods
 *
 * Each specific RAG implementation (UserLibraryRAG, CampaignRAG) extends this
 * to maintain isolation while sharing common functionality.
 */
export abstract class BaseRAGService {
	protected dbUtils: DatabaseUtils;
	protected env?: any;

	constructor(
		protected db: D1Database,
		protected vectorize: VectorizeIndex,
		protected openaiApiKey: unknown,
		env?: any
	) {
		// Validate dependencies in constructor - fail fast if required dependencies are missing
		this.validateDependencies();
		this.dbUtils = new DatabaseUtils(db);
		this.env = env;
	}

	/**
	 * Generate embeddings using the configured embedding provider.
	 */
	public async generateEmbeddings(texts: string[]): Promise<number[][]> {
		const apiKey = await this.resolveOpenAIKeyOptional();

		try {
			const embeddingProvider = new ProviderEmbeddingService({
				openaiApiKey: apiKey,
				aiBinding: this.env?.AI,
			});
			return await embeddingProvider.generateEmbeddings(texts);
		} catch (error) {
			if (
				error instanceof EmbeddingGenerationError ||
				error instanceof LLMProviderAPIKeyError
			) {
				throw error;
			}
			throw new EmbeddingGenerationError();
		}
	}

	/**
	 * Chunk text into smaller pieces for processing
	 *
	 * @param text - The text to chunk
	 * @param maxChunkSize - Maximum size of each chunk (default: 1000)
	 * @param overlap - Overlap between chunks (default: 200)
	 * @returns Array of chunks with metadata
	 */
	protected chunkText(
		text: string,
		maxChunkSize: number = 1000,
		overlap: number = 200
	): Array<{ text: string; index: number; metadata?: Record<string, any> }> {
		const chunks: Array<{
			text: string;
			index: number;
			metadata?: Record<string, any>;
		}> = [];
		let start = 0;
		let index = 0;

		while (start < text.length) {
			const end = Math.min(start + maxChunkSize, text.length);
			let chunkText = text.slice(start, end);

			// Try to break at sentence boundaries
			if (end < text.length) {
				const lastPeriod = chunkText.lastIndexOf(".");
				const lastExclamation = chunkText.lastIndexOf("!");
				const lastQuestion = chunkText.lastIndexOf("?");
				const lastBreak = Math.max(lastPeriod, lastExclamation, lastQuestion);

				if (lastBreak > start + maxChunkSize * 0.5) {
					chunkText = chunkText.slice(0, lastBreak + 1);
				}
			}

			chunks.push({
				text: chunkText.trim(),
				index,
				metadata: {
					start_char: start,
					end_char: start + chunkText.length,
				},
			});

			start += chunkText.length - overlap;
			index++;
		}

		return chunks;
	}

	/**
	 * Update status in database (default implementation, can be overridden by subclasses)
	 */
	protected async updateStatus(
		identifier: string,
		status: string
	): Promise<void> {
		try {
			// Try to update file record if fileDAO is available
			if (this.env?.DB) {
				const { getDAOFactory } = await import("@/dao/dao-factory");
				const fileDAO = getDAOFactory(this.env).fileDAO;
				await fileDAO.updateFileRecord(identifier, status);
			} else {
			}
		} catch (_error) {}
	}

	/**
	 * Validate that the service has required dependencies
	 * Called automatically in constructor to ensure service is properly configured
	 * Note: Some services may pass null for dependencies they don't need (e.g., FileAnalysisService)
	 * This validation ensures that provided dependencies are valid
	 */
	protected validateDependencies(): void {
		// Validate DB if provided (some services like FileAnalysisService don't need it)
		if (this.db === null || this.db === undefined) {
			// DB is optional for some services
		} else if (!this.db) {
			throw new DatabaseConnectionError("Database not configured");
		}

		// Validate Vectorize if provided (some services like FileAnalysisService don't need it)
		if (this.vectorize === null || this.vectorize === undefined) {
			// Vectorize is optional for some services
		} else if (!this.vectorize) {
			throw new VectorizeIndexRequiredError("Vectorize index not configured");
		}

		// Validate OpenAI API key binding shape if provided (some services may not need embeddings)
		if (!this.openaiApiKey) return;
		if (typeof this.openaiApiKey === "string") return;
		if (
			this.openaiApiKey &&
			typeof this.openaiApiKey === "object" &&
			"get" in this.openaiApiKey &&
			typeof (this.openaiApiKey as { get?: unknown }).get === "function"
		) {
			return;
		}
		throw new LLMProviderAPIKeyError("OpenAI API key not configured");
	}

	private async resolveOpenAIKeyOptional(): Promise<string | undefined> {
		if (typeof this.openaiApiKey === "string") {
			const trimmed = this.openaiApiKey.trim();
			if (trimmed) return trimmed;
		}

		if (this.env) {
			const raw = await getEnvVar(this.env, "OPENAI_API_KEY", false);
			const trimmed = raw.trim();
			if (trimmed) return trimmed;
		}

		return undefined;
	}

	/**
	 * Create a standardized error response
	 */
	protected createErrorResponse(
		message: string,
		error?: any
	): { error: string; details?: any } {
		return {
			error: message,
			details: error instanceof Error ? error.message : error,
		};
	}

	/**
	 * Log operation for debugging
	 */
	protected logOperation(_operation: string, _details?: any): void {}
}
