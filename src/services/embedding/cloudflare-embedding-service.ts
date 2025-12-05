import { InvalidEmbeddingResponseError } from "@/lib/errors";

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const EMBEDDING_TEXT_LIMIT = 4000;

/**
 * Service for generating embeddings using Cloudflare AI
 */
export class CloudflareEmbeddingService {
  constructor(private ai: any) {}

  /**
   * Generate embedding for a single text string
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.ai) {
      throw new Error("AI binding not available");
    }

    try {
      const truncatedText = text.substring(0, EMBEDDING_TEXT_LIMIT);
      const embeddingResponse = await this.ai.run(EMBEDDING_MODEL, {
        text: truncatedText,
      });

      // Parse the response - handle different response types
      let responseText: string;
      if (typeof embeddingResponse === "string") {
        responseText = embeddingResponse;
      } else if (
        embeddingResponse &&
        typeof embeddingResponse === "object" &&
        "response" in embeddingResponse
      ) {
        responseText = (embeddingResponse as any).response;
      } else if (
        embeddingResponse &&
        typeof embeddingResponse === "object" &&
        "data" in embeddingResponse
      ) {
        const data = (embeddingResponse as any).data;
        if (Array.isArray(data)) {
          return data;
        }
        responseText = JSON.stringify(embeddingResponse);
      } else {
        responseText = JSON.stringify(embeddingResponse);
      }

      const parsedResponse = JSON.parse(responseText);
      if (Array.isArray(parsedResponse)) {
        return parsedResponse;
      }

      throw new InvalidEmbeddingResponseError();
    } catch (error) {
      console.warn(
        `[CloudflareEmbeddingService] AI embedding failed, using fallback:`,
        error
      );
      return this.generateFallbackEmbedding(text);
    }
  }

  /**
   * Generate embeddings for multiple text strings
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.generateEmbedding(text)));
  }

  /**
   * Generate a basic fallback embedding using hash-based method
   */
  private generateFallbackEmbedding(text: string): number[] {
    const hash = this.simpleHash(text);
    const embeddings: number[] = [];

    // Generate 1536-dimensional vector (matching OpenAI embeddings)
    for (let i = 0; i < 1536; i++) {
      const seed = hash + i;
      embeddings.push((Math.sin(seed) + 1) / 2); // Normalize to [0, 1]
    }

    return embeddings;
  }

  /**
   * Simple hash function for fallback embeddings
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
