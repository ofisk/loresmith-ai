import type { VectorizeIndex } from "@cloudflare/workers-types";
import { VectorizeIndexRequiredError } from "@/lib/errors";
import { chunkTextByCharacterCount } from "@/lib/text-chunking-utils";
import { CloudflareEmbeddingService } from "./cloudflare-embedding-service";

const EMBEDDING_CHUNK_SIZE = 3500; // Stay safely under 4000 char limit
const BATCH_SIZE = 1000; // Process in batches to avoid timeout/memory issues
const WARNING_CHUNK_THRESHOLD = 5000;
const MAX_METADATA_TEXT_LENGTH = 200; // Limit metadata text to stay under Vectorize metadata size limits (~2KB per vector)

export interface EmbeddingMetadata {
  metadataId: string;
  type?: string;
}

/**
 * Service for storing file embeddings in Vectorize
 * Handles chunking, embedding generation, and batch insertion
 */
export class FileEmbeddingService {
  private embeddingService: CloudflareEmbeddingService;

  constructor(
    private vectorize: VectorizeIndex | undefined,
    ai: any
  ) {
    this.embeddingService = new CloudflareEmbeddingService(ai);
  }

  /**
   * Store embeddings for a text string in Vectorize
   * Returns the primary vector ID (first chunk)
   */
  async storeEmbeddings(
    text: string,
    metadataId: string,
    metadata: EmbeddingMetadata = { metadataId }
  ): Promise<string> {
    if (!this.vectorize) {
      throw new VectorizeIndexRequiredError();
    }

    try {
      // Chunk text for large files
      const textChunks =
        text.length > EMBEDDING_CHUNK_SIZE
          ? chunkTextByCharacterCount(text, EMBEDDING_CHUNK_SIZE)
          : [text];

      console.log(
        `[FileEmbeddingService] Storing embeddings for ${textChunks.length} chunk(s) (total text length: ${text.length} chars)`
      );

      // Warn if we have too many chunks
      if (textChunks.length > WARNING_CHUNK_THRESHOLD) {
        console.warn(
          `[FileEmbeddingService] WARNING: Large number of chunks (${textChunks.length}) may cause timeout. Consider processing in background queue.`
        );
      }

      // Generate and store embeddings for each chunk
      const vectorsToInsert: Array<{
        id: string;
        values: number[];
        metadata: Record<string, any>;
      }> = [];
      let primaryVectorId: string | undefined;

      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        const chunkText = chunk.substring(0, EMBEDDING_CHUNK_SIZE);

        // Generate embedding for this chunk
        const embeddings =
          await this.embeddingService.generateEmbedding(chunkText);

        // Generate vector ID for this chunk
        const chunkVectorId = await this.generateVectorId(
          metadataId,
          `${i}-${Date.now()}`
        );

        // First chunk is the primary vector ID
        if (i === 0) {
          primaryVectorId = chunkVectorId;
        }

        vectorsToInsert.push({
          id: chunkVectorId,
          values: embeddings,
          metadata: {
            ...metadata,
            text: chunkText.substring(0, MAX_METADATA_TEXT_LENGTH), // Store first 200 chars as metadata (Vectorize metadata limit ~2KB)
            type: metadata.type || "file_content",
            chunkIndex: i,
            totalChunks: textChunks.length,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Store all embeddings in Vectorize
      await this.insertVectorsInBatches(vectorsToInsert);

      console.log(
        `[FileEmbeddingService] Successfully stored ${vectorsToInsert.length} embedding(s) for ${metadataId}`
      );

      if (!primaryVectorId) {
        throw new Error("Failed to generate primary vector ID");
      }

      return primaryVectorId;
    } catch (error) {
      console.error(`[FileEmbeddingService] Error storing embeddings:`, error);
      throw new Error(
        `Failed to store embeddings: ${error instanceof Error ? error.message : String(error)}. File may be too large or processing timed out.`
      );
    }
  }

  /**
   * Insert vectors in batches to avoid timeout/memory issues
   */
  private async insertVectorsInBatches(
    vectors: Array<{
      id: string;
      values: number[];
      metadata: Record<string, any>;
    }>
  ): Promise<void> {
    if (!this.vectorize) {
      throw new VectorizeIndexRequiredError();
    }

    try {
      if (vectors.length > BATCH_SIZE) {
        console.log(
          `[FileEmbeddingService] Batch inserting ${vectors.length} vectors in batches of ${BATCH_SIZE}`
        );
        for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
          const batch = vectors.slice(i, i + BATCH_SIZE);
          try {
            await this.vectorize.insert(batch);
            console.log(
              `[FileEmbeddingService] Stored batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(vectors.length / BATCH_SIZE)} (${batch.length} vectors)`
            );
          } catch (batchError) {
            const errorDetails =
              batchError instanceof Error
                ? { message: batchError.message, stack: batchError.stack }
                : { error: String(batchError) };
            console.error(
              `[FileEmbeddingService] Failed to insert batch ${Math.floor(i / BATCH_SIZE) + 1}:`,
              errorDetails
            );
            // Log batch details for debugging
            const batchSizeBytes = JSON.stringify(batch).length;
            console.error(
              `[FileEmbeddingService] Batch details: ${batch.length} vectors, ~${(batchSizeBytes / 1024).toFixed(2)}KB JSON size`
            );
            throw batchError;
          }
        }
      } else {
        await this.vectorize.insert(vectors);
      }
    } catch (error) {
      // Log detailed error information
      const errorDetails =
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : { error: String(error) };
      console.error(
        `[FileEmbeddingService] Vectorize insert error:`,
        errorDetails
      );

      // Log vector details for debugging
      const totalSizeBytes = JSON.stringify(vectors).length;
      const avgMetadataSize =
        vectors.length > 0 ? JSON.stringify(vectors[0].metadata).length : 0;
      console.error(
        `[FileEmbeddingService] Vector details: ${vectors.length} vectors, ~${(totalSizeBytes / 1024).toFixed(2)}KB total JSON size, ~${(avgMetadataSize / 1024).toFixed(2)}KB avg metadata per vector`
      );

      throw error;
    }
  }

  /**
   * Generate a Vectorize-compatible vector ID that is guaranteed to be under 64 bytes
   */
  private async generateVectorId(
    metadataId: string,
    suffix?: string
  ): Promise<string> {
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(metadataId + (suffix || ""))
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Use first 48 characters of hash (48 bytes) + "v_" prefix (2 bytes) = 50 bytes total
    const shortHash = hashHex.substring(0, 48);
    return `v_${shortHash}`;
  }
}
