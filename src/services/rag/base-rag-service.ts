import type { D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import { DatabaseUtils } from "@/lib/dbUtils";
import {
  OpenAIAPIKeyError,
  EmbeddingGenerationError,
  DatabaseConnectionError,
  VectorizeIndexRequiredError,
  AutoRAGSearchConfigError,
  AutoRAGSearchError,
} from "@/lib/errors";

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
    protected openaiApiKey: string,
    env?: any
  ) {
    // Validate dependencies in constructor - fail fast if required dependencies are missing
    this.validateDependencies();
    this.dbUtils = new DatabaseUtils(db);
    this.env = env;
  }

  /**
   * Generate embeddings for an array of texts using OpenAI
   */
  public async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.openaiApiKey) {
      throw new OpenAIAPIKeyError();
    }

    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          input: texts,
          model: "text-embedding-3-small",
        }),
      });

      if (!response.ok) {
        throw new EmbeddingGenerationError(
          `OpenAI API error: ${response.statusText}`
        );
      }

      const result = (await response.json()) as any;
      return result.data.map((item: any) => item.embedding);
    } catch (error) {
      console.error("Error generating embeddings:", error);
      if (
        error instanceof EmbeddingGenerationError ||
        error instanceof OpenAIAPIKeyError
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
        // Fallback to logging if no database access
        console.log(
          `[BaseRAGService] Status update for ${identifier}: ${status}`
        );
      }
    } catch (error) {
      console.error(`[BaseRAGService] Error updating status:`, error);
      // Fallback to logging on error
      console.log(
        `[BaseRAGService] Status update for ${identifier}: ${status}`
      );
    }
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

    // Validate OpenAI API key if provided (some services may not need embeddings)
    if (!this.openaiApiKey) {
      // OpenAI API key is optional for services that don't generate embeddings
    } else if (typeof this.openaiApiKey !== "string") {
      throw new OpenAIAPIKeyError("OpenAI API key not configured");
    }
  }

  /**
   * Create a standardized error response
   */
  protected createErrorResponse(
    message: string,
    error?: any
  ): { error: string; details?: any } {
    console.error(`RAG Service Error: ${message}`, error);
    return {
      error: message,
      details: error instanceof Error ? error.message : error,
    };
  }

  /**
   * Log operation for debugging
   */
  protected logOperation(operation: string, details?: any): void {
    console.log(`[BaseRAGService] ${operation}`, details);
  }

  /**
   * Query Cloudflare AutoRAG with a search prompt
   * This is a generic method that can be used by any service that needs to query AutoRAG
   */
  protected async queryAutoRAG(
    prompt: string,
    searchUrl: string,
    apiToken: string,
    options: {
      maxResults?: number;
      includeMetadata?: boolean;
      includeChunks?: boolean;
    } = {}
  ): Promise<any> {
    if (!searchUrl || !apiToken) {
      throw new AutoRAGSearchConfigError();
    }

    const {
      maxResults = 5,
      includeMetadata = true,
      includeChunks = false,
    } = options;

    const response = await fetch(searchUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: prompt,
        max_results: maxResults,
        search_options: {
          include_metadata: includeMetadata,
          include_chunks: includeChunks,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AutoRAGSearchError(response.status, errorText);
    }

    return await response.json();
  }
}
