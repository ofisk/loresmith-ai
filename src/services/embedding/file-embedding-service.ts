import type { VectorizeIndex } from "@cloudflare/workers-types";
import { getEnvVar } from "@/lib/env-utils";
import {
	EmbeddingGenerationError,
	LLMProviderAPIKeyError,
	VectorizeIndexRequiredError,
} from "@/lib/errors";
import { chunkTextByCharacterCount } from "@/lib/file/text-chunking-utils";
import { OpenAIEmbeddingService } from "./openai-embedding-service";

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
	constructor(
		private vectorize: VectorizeIndex | undefined,
		private openaiApiKey: unknown,
		private env?: Record<string, unknown>
	) {}

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

			// Warn if we have too many chunks
			if (textChunks.length > WARNING_CHUNK_THRESHOLD) {
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

				// Generate embedding for this chunk using OpenAI
				const embeddings = await this.generateEmbedding(chunkText);

				// Validate embedding dimensions
				if (!Array.isArray(embeddings) || embeddings.length === 0) {
					throw new Error(
						`Invalid embedding: expected array, got ${typeof embeddings}`
					);
				}

				// Validate embedding has correct dimensions
				if (embeddings.length !== OpenAIEmbeddingService.EXPECTED_DIMENSIONS) {
					throw new Error(
						`Invalid embedding dimensions: expected ${OpenAIEmbeddingService.EXPECTED_DIMENSIONS}, got ${embeddings.length}`
					);
				}

				// Validate all values are numbers
				const hasInvalidValues = embeddings.some(
					(v) => typeof v !== "number" || !Number.isFinite(v)
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

			if (!primaryVectorId) {
				throw new Error("Failed to generate primary vector ID");
			}

			return primaryVectorId;
		} catch (error) {
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

		if (sanitizedVectors.length > BATCH_SIZE) {
			for (let i = 0; i < sanitizedVectors.length; i += BATCH_SIZE) {
				const batch = sanitizedVectors.slice(i, i + BATCH_SIZE);
				await this.vectorize.insert(batch);
			}
		} else {
			await this.vectorize.insert(sanitizedVectors);
		}
	}

	/**
	 * Generate embedding using OpenAI API
	 */
	private async generateEmbedding(text: string): Promise<number[]> {
		const apiKey = await this.resolveOpenAIKey();

		try {
			const response = await fetch(OpenAIEmbeddingService.EMBEDDINGS_API_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					input: text,
					model: OpenAIEmbeddingService.EMBEDDING_MODEL,
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

			// Validate dimensions
			if (embedding.length !== OpenAIEmbeddingService.EXPECTED_DIMENSIONS) {
				throw new EmbeddingGenerationError(
					`Invalid embedding dimensions: expected ${OpenAIEmbeddingService.EXPECTED_DIMENSIONS}, got ${embedding.length}`
				);
			}

			return embedding;
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

	private async resolveOpenAIKey(): Promise<string> {
		if (typeof this.openaiApiKey === "string") {
			const trimmed = this.openaiApiKey.trim();
			if (trimmed) return trimmed;
		}

		if (this.env) {
			const raw = await getEnvVar(this.env, "OPENAI_API_KEY", true);
			const trimmed = raw.trim();
			if (trimmed) return trimmed;
		}

		throw new LLMProviderAPIKeyError();
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
