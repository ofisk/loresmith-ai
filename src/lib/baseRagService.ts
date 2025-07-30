import type { D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import { DatabaseUtils } from "./dbUtils";

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

  constructor(
    protected db: D1Database,
    protected vectorize: VectorizeIndex,
    protected openaiApiKey?: string
  ) {
    this.dbUtils = new DatabaseUtils(db);
  }

  /**
   * Generate embeddings for an array of texts using OpenAI
   */
  protected async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.openaiApiKey) {
      throw new Error("OpenAI API key is required for embedding generation");
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
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const result = (await response.json()) as any;
      return result.data.map((item: any) => item.embedding);
    } catch (error) {
      console.error("Error generating embeddings:", error);
      throw new Error("Failed to generate embeddings");
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
   * Update status in database (to be implemented by subclasses)
   */
  protected abstract updateStatus(
    identifier: string,
    status: string
  ): Promise<void>;

  /**
   * Get chunks by IDs (to be implemented by subclasses)
   */
  protected abstract getChunksByIds(ids: string[]): Promise<any[]>;

  /**
   * Validate that the service has required dependencies
   */
  protected validateDependencies(): void {
    if (!this.db) {
      throw new Error("Database connection is required");
    }
    if (!this.vectorize) {
      throw new Error("Vectorize index is required");
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
}
