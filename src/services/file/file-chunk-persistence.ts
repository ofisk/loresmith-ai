import type { FileDAO } from "@/dao/file/file-dao";
import { createLogger } from "@/lib/logger";
import type { StoredEmbeddingChunk } from "@/services/embedding/file-embedding-service";

/**
 * Stride between processing-chunk index ranges in `file_chunks.chunk_index`.
 * Keeps ranges non-overlapping so retries can replace one processing chunk safely.
 */
export const PROCESSING_CHUNK_INDEX_STRIDE = 10_000;

/**
 * Replace all RAG text chunks for a file (direct / non-chunked indexing path).
 * Call after Vectorize embeddings succeed so agent tools can read full text.
 */
export async function persistFileTextChunks(
	fileDAO: FileDAO,
	fileKey: string,
	username: string,
	chunks: StoredEmbeddingChunk[],
	options?: {
		vectorId?: string;
		env?: Record<string, unknown>;
	}
): Promise<void> {
	const log = createLogger(options?.env, "[FileChunkPersistence]");

	await fileDAO.replaceFileChunks(
		fileKey,
		username,
		chunks.map((c) => ({
			chunkIndex: c.chunkIndex,
			content: c.text,
			embedding: c.vectorId,
		}))
	);

	const metadataUpdates: { vector_id?: string; chunk_count: number } = {
		chunk_count: chunks.length,
	};
	if (options?.vectorId) {
		metadataUpdates.vector_id = options.vectorId;
	}
	await fileDAO.updateFileMetadata(fileKey, metadataUpdates);

	log.info("Persisted file_chunks after embedding", {
		fileKey,
		username,
		chunkCount: chunks.length,
		vectorId: options?.vectorId,
	});
}

/**
 * Replace RAG text chunks belonging to one large-file processing chunk.
 * Safe to call on retry: deletes the prior index range for that processing chunk first.
 */
export async function persistProcessingChunkTextChunks(
	fileDAO: FileDAO,
	fileKey: string,
	username: string,
	processingChunkIndex: number,
	chunks: StoredEmbeddingChunk[],
	options?: { env?: Record<string, unknown> }
): Promise<void> {
	const log = createLogger(options?.env, "[FileChunkPersistence]");
	const base = processingChunkIndex * PROCESSING_CHUNK_INDEX_STRIDE;

	await fileDAO.replaceFileChunksInIndexRange(
		fileKey,
		username,
		base,
		base + PROCESSING_CHUNK_INDEX_STRIDE,
		chunks.map((c, i) => ({
			id: `${fileKey}-pc${processingChunkIndex}-${i}`,
			chunkIndex: base + i,
			content: c.text,
			embedding: c.vectorId,
		}))
	);

	log.info("Persisted file_chunks for processing chunk", {
		fileKey,
		username,
		processingChunkIndex,
		chunkCount: chunks.length,
		chunkIndexBase: base,
	});
}
