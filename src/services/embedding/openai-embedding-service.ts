import { OpenAIAPIKeyError, EmbeddingGenerationError } from "@/lib/errors";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_TEXT_LIMIT = 8191; // Max input tokens for text-embedding-3-small
const OPENAI_EMBEDDINGS_API_URL = "https://api.openai.com/v1/embeddings";
const EXPECTED_DIMENSIONS = 1536; // OpenAI text-embedding-3-small returns 1536 dimensions

export class OpenAIEmbeddingService {
  static readonly EXPECTED_DIMENSIONS = EXPECTED_DIMENSIONS;
  static readonly EMBEDDINGS_API_URL = OPENAI_EMBEDDINGS_API_URL;
  static readonly EMBEDDING_MODEL = EMBEDDING_MODEL;

  constructor(private openaiApiKey: string | undefined) {}

  /**
   * Generate embedding for a single text string
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openaiApiKey) {
      throw new OpenAIAPIKeyError();
    }

    try {
      const truncatedText = text.substring(0, EMBEDDING_TEXT_LIMIT);
      const response = await fetch(OPENAI_EMBEDDINGS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          input: truncatedText,
          model: EMBEDDING_MODEL,
        }),
      });

      if (!response.ok) {
        throw new EmbeddingGenerationError(
          `OpenAI API error: ${response.statusText}`
        );
      }

      const result = (await response.json()) as any;
      const embedding = result.data[0]?.embedding;

      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new EmbeddingGenerationError("Invalid embedding response");
      }

      // Validate dimensions (OpenAI text-embedding-3-small returns 1536)
      if (embedding.length !== EXPECTED_DIMENSIONS) {
        throw new EmbeddingGenerationError(
          `Invalid embedding dimensions: expected ${EXPECTED_DIMENSIONS}, got ${embedding.length}`
        );
      }

      return embedding;
    } catch (error) {
      console.error("Error generating embeddings with OpenAI:", error);
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
   * Generate embeddings for multiple texts in a single API call
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.openaiApiKey) {
      throw new OpenAIAPIKeyError();
    }

    try {
      const truncatedTexts = texts.map((text) =>
        text.substring(0, EMBEDDING_TEXT_LIMIT)
      );
      const response = await fetch(OPENAI_EMBEDDINGS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          input: truncatedTexts,
          model: EMBEDDING_MODEL,
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
      console.error("Error generating embeddings with OpenAI:", error);
      if (
        error instanceof EmbeddingGenerationError ||
        error instanceof OpenAIAPIKeyError
      ) {
        throw error;
      }
      throw new EmbeddingGenerationError();
    }
  }
}
