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

      console.log(
        `[CloudflareEmbeddingService] Raw embedding response type:`,
        typeof embeddingResponse,
        Array.isArray(embeddingResponse)
          ? `array(length=${embeddingResponse.length})`
          : "not array"
      );

      // Handle direct array response (most common case)
      if (Array.isArray(embeddingResponse)) {
        if (embeddingResponse.length === 0) {
          throw new InvalidEmbeddingResponseError("Empty embedding array");
        }
        // Validate all elements are numbers
        const isValid = embeddingResponse.every((v) => typeof v === "number");
        if (!isValid) {
          throw new InvalidEmbeddingResponseError(
            "Embedding array contains non-numeric values"
          );
        }
        // Validate dimensions (BGE model returns 768)
        if (embeddingResponse.length !== 768) {
          throw new InvalidEmbeddingResponseError(
            `Invalid embedding dimensions: expected 768, got ${embeddingResponse.length}`
          );
        }
        console.log(
          `[CloudflareEmbeddingService] Got array embedding with ${embeddingResponse.length} dimensions`
        );
        return embeddingResponse;
      }

      // Handle object responses with nested data
      if (embeddingResponse && typeof embeddingResponse === "object") {
        // Check for direct data array (BGE model returns data as number[][])
        if (
          "data" in embeddingResponse &&
          Array.isArray((embeddingResponse as any).data)
        ) {
          const data = (embeddingResponse as any).data;
          console.log(
            `[CloudflareEmbeddingService] Got data field: array with ${data.length} elements`
          );

          // BGE model returns data as number[][] - array of embedding arrays
          // For single text input, we get one embedding array
          if (data.length > 0) {
            const firstEmbedding = data[0];
            if (Array.isArray(firstEmbedding)) {
              console.log(
                `[CloudflareEmbeddingService] Extracted embedding array with ${firstEmbedding.length} dimensions from data[0]`
              );
              // Validate all elements are numbers
              const isValid = firstEmbedding.every(
                (v) => typeof v === "number" && Number.isFinite(v)
              );
              if (!isValid) {
                throw new InvalidEmbeddingResponseError(
                  "Embedding array contains invalid numeric values"
                );
              }
              // Validate dimensions (BGE model returns 768)
              if (firstEmbedding.length !== 768) {
                throw new InvalidEmbeddingResponseError(
                  `Invalid embedding dimensions: expected 768, got ${firstEmbedding.length}`
                );
              }
              return firstEmbedding;
            }
          }
        }

        // Check for response string that might contain JSON
        if (
          "response" in embeddingResponse &&
          typeof (embeddingResponse as any).response === "string"
        ) {
          try {
            const parsed = JSON.parse((embeddingResponse as any).response);
            if (Array.isArray(parsed)) {
              console.log(
                `[CloudflareEmbeddingService] Got embedding from parsed response with ${parsed.length} dimensions`
              );
              return parsed;
            }
          } catch (parseError) {
            console.warn(
              "[CloudflareEmbeddingService] Failed to parse response string:",
              parseError
            );
          }
        }

        // Try to find any array property in the response object
        for (const [key, value] of Object.entries(embeddingResponse)) {
          if (Array.isArray(value) && value.length > 0) {
            console.log(
              `[CloudflareEmbeddingService] Found embedding array in key '${key}' with ${value.length} dimensions`
            );
            return value as number[];
          }
        }
      }

      // Handle string response (JSON stringified)
      if (typeof embeddingResponse === "string") {
        try {
          const parsed = JSON.parse(embeddingResponse);
          if (Array.isArray(parsed)) {
            console.log(
              `[CloudflareEmbeddingService] Got embedding from parsed string with ${parsed.length} dimensions`
            );
            return parsed;
          }
        } catch (parseError) {
          console.warn(
            "[CloudflareEmbeddingService] Failed to parse string response:",
            parseError
          );
        }
      }

      console.error(
        `[CloudflareEmbeddingService] Unable to extract embedding from response:`,
        JSON.stringify(embeddingResponse).substring(0, 500)
      );
      throw new InvalidEmbeddingResponseError(
        "Could not extract embedding array from response"
      );
    } catch (error) {
      if (error instanceof InvalidEmbeddingResponseError) {
        throw error;
      }
      console.warn(
        `[CloudflareEmbeddingService] AI embedding failed, using fallback:`,
        error instanceof Error ? error.message : String(error)
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

    // Generate 768-dimensional vector (matching BGE model @cf/baai/bge-base-en-v1.5)
    for (let i = 0; i < 768; i++) {
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
