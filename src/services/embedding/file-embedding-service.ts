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

        // Validate embedding dimensions
        if (!Array.isArray(embeddings) || embeddings.length === 0) {
          throw new Error(
            `Invalid embedding: expected array, got ${typeof embeddings}`
          );
        }

        // Log embedding dimensions for debugging
        console.log(
          `[FileEmbeddingService] Generated embedding for chunk ${i + 1}/${textChunks.length} with ${embeddings.length} dimensions`
        );

        // Validate all values are numbers
        const hasInvalidValues = embeddings.some(
          (v) => typeof v !== "number" || !isFinite(v)
        );
        if (hasInvalidValues) {
          throw new Error(`Embedding contains invalid numeric values`);
        }

        // Generate vector ID for this chunk
        const chunkVectorId = await this.generateVectorId(
          metadataId,
          `${i}-${Date.now()}`
        );

        // First chunk is the primary vector ID
        if (i === 0) {
          primaryVectorId = chunkVectorId;
        }

        // Sanitize text for metadata: remove newlines, control characters, and limit length
        let sanitizedText = chunkText
          .substring(0, MAX_METADATA_TEXT_LENGTH)
          .replace(/[\r\n\t]/g, " "); // Replace newlines and tabs with spaces

        // Remove control characters (U+0000-U+001F and U+007F) using character filtering
        sanitizedText = sanitizedText
          .split("")
          .filter((char) => {
            const code = char.charCodeAt(0);
            // Keep printable characters (space U+0020 and above, excluding DEL U+007F)
            return code >= 0x20 && code !== 0x7f;
          })
          .join("")
          .trim();

        vectorsToInsert.push({
          id: chunkVectorId,
          values: embeddings,
          metadata: {
            metadataId: metadata.metadataId || metadataId,
            ...(metadata.type && { type: metadata.type }),
            text: sanitizedText,
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

    // Validate and sanitize vectors before insertion
    const sanitizedVectors = vectors.map((vector) => {
      // Ensure metadata values are valid Vectorize types (string, number, boolean, string[])
      const sanitizedMetadata: Record<
        string,
        string | number | boolean | string[]
      > = {};
      for (const [key, value] of Object.entries(vector.metadata)) {
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          sanitizedMetadata[key] = value;
        } else if (Array.isArray(value)) {
          // Vectorize only supports string arrays, convert all array values to strings
          const stringArray = value
            .map((v) => String(v))
            .filter((v) => v.length > 0);
          if (stringArray.length > 0) {
            sanitizedMetadata[key] = stringArray;
          }
        } else if (value !== null && value !== undefined) {
          // Convert other types to string
          sanitizedMetadata[key] = String(value);
        }
      }

      return {
        id: vector.id,
        values: vector.values,
        metadata: sanitizedMetadata,
      };
    });

    try {
      if (sanitizedVectors.length > BATCH_SIZE) {
        console.log(
          `[FileEmbeddingService] Batch inserting ${sanitizedVectors.length} vectors in batches of ${BATCH_SIZE}`
        );
        for (let i = 0; i < sanitizedVectors.length; i += BATCH_SIZE) {
          const batch = sanitizedVectors.slice(i, i + BATCH_SIZE);
          try {
            await this.vectorize.insert(batch);
            console.log(
              `[FileEmbeddingService] Stored batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(sanitizedVectors.length / BATCH_SIZE)} (${batch.length} vectors)`
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
            try {
              const batchSizeBytes = JSON.stringify(batch).length;
              console.error(
                `[FileEmbeddingService] Batch details: ${batch.length} vectors, ~${(batchSizeBytes / 1024).toFixed(2)}KB JSON size`
              );
              // Log first vector structure for debugging
              if (batch.length > 0) {
                console.error(
                  `[FileEmbeddingService] First vector sample:`,
                  JSON.stringify(
                    {
                      id: batch[0].id,
                      valuesLength: batch[0].values.length,
                      metadata: batch[0].metadata,
                    },
                    null,
                    2
                  )
                );
              }
            } catch (jsonError) {
              console.error(
                `[FileEmbeddingService] Failed to serialize batch for logging:`,
                jsonError
              );
            }
            throw batchError;
          }
        }
      } else {
        await this.vectorize.insert(sanitizedVectors);
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
      try {
        const totalSizeBytes = JSON.stringify(sanitizedVectors).length;
        const avgMetadataSize =
          sanitizedVectors.length > 0
            ? JSON.stringify(sanitizedVectors[0].metadata).length
            : 0;
        console.error(
          `[FileEmbeddingService] Vector details: ${sanitizedVectors.length} vectors, ~${(totalSizeBytes / 1024).toFixed(2)}KB total JSON size, ~${(avgMetadataSize / 1024).toFixed(2)}KB avg metadata per vector`
        );
        // Log first vector structure for debugging
        if (sanitizedVectors.length > 0) {
          console.error(
            `[FileEmbeddingService] First vector sample:`,
            JSON.stringify(
              {
                id: sanitizedVectors[0].id,
                valuesLength: sanitizedVectors[0].values.length,
                metadata: sanitizedVectors[0].metadata,
              },
              null,
              2
            )
          );
        }
      } catch (jsonError) {
        console.error(
          `[FileEmbeddingService] Failed to serialize vectors for logging:`,
          jsonError
        );
      }

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
