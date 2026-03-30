import { PROCESSING_LIMITS } from "@/app-constants";
import { FileDAO } from "@/dao";
import { MemoryLimitError } from "@/lib/errors";
import { extractPdfPagesRangeFromR2 } from "@/lib/file/pdf-r2-range-transport";
import { extractPdfPagesRange } from "@/lib/file/pdf-utils";
import { createLogger } from "@/lib/logger";
import type { Env } from "@/middleware/auth";
import { FileEmbeddingService } from "@/services/embedding/file-embedding-service";
import type { ChunkDefinition } from "@/types/upload";
import {
	type ExtractionResult,
	FileExtractionService,
} from "./file-extraction-service";
import { PDFChunkingService } from "./pdf-chunking-service";

/**
 * Service for handling chunked processing of large files that exceed memory limits
 */
export class ChunkedProcessingService {
	private fileDAO: FileDAO;
	private extractionService: FileExtractionService;
	private pdfChunkingService: PDFChunkingService;

	constructor(private env: Env) {
		this.fileDAO = new FileDAO(env.DB);
		this.extractionService = new FileExtractionService();
		this.pdfChunkingService = new PDFChunkingService();
	}

	/**
	 * Check if a file has existing processing chunks
	 */
	async hasExistingChunks(fileKey: string): Promise<boolean> {
		const chunks = await this.fileDAO.getFileProcessingChunks(fileKey);
		return chunks.length > 0;
	}

	/**
	 * Determine chunking strategy for a file based on type and size
	 */
	async determineChunkingStrategy(
		fileKey: string,
		contentType: string,
		fileSizeMB: number
	): Promise<{
		shouldChunk: boolean;
		chunks?: ChunkDefinition[];
		reason?: string;
	}> {
		// Check if file already has chunks (retry scenario)
		const existingChunks = await this.fileDAO.getFileProcessingChunks(fileKey);
		if (existingChunks.length > 0) {
			return {
				shouldChunk: true,
				chunks: existingChunks.map((chunk) => ({
					chunkIndex: chunk.chunkIndex,
					totalChunks: chunk.totalChunks,
					pageRangeStart: chunk.pageRangeStart,
					pageRangeEnd: chunk.pageRangeEnd,
					byteRangeStart: chunk.byteRangeStart,
					byteRangeEnd: chunk.byteRangeEnd,
				})),
				reason: `File already has ${existingChunks.length} processing chunks`,
			};
		}

		// Check if file needs chunking
		if (contentType.includes("pdf")) {
			// For PDFs, we need to get page count first
			// Since we can't load the file here (that's the problem), we'll estimate
			// and create chunks during processing when we can access the file
			const shouldChunk = this.pdfChunkingService.shouldChunkPdf(fileSizeMB);
			if (shouldChunk.shouldChunk) {
				return {
					shouldChunk: true,
					reason: shouldChunk.reason || "PDF file is too large",
				};
			}
		} else {
			// For non-PDFs, check size
			const MEMORY_LIMIT_MB = PROCESSING_LIMITS.MEMORY_LIMIT_MB;
			if (fileSizeMB > MEMORY_LIMIT_MB) {
				return {
					shouldChunk: true,
					reason: `File (${fileSizeMB.toFixed(2)}MB) exceeds Worker memory limit (${MEMORY_LIMIT_MB}MB)`,
				};
			}
		}

		return { shouldChunk: false };
	}

	/**
	 * Create processing chunks for a file
	 * For PDFs, estimates page count from file size (since PDF.js requires full buffer anyway)
	 * For other files, creates byte-range chunks
	 */
	async createProcessingChunks(
		fileKey: string,
		username: string,
		_fileName: string,
		contentType: string,
		fileSize: number,
		_fileBuffer?: ArrayBuffer
	): Promise<ChunkDefinition[]> {
		const fileSizeMB = fileSize / (1024 * 1024);

		let chunks: ChunkDefinition[] = [];

		if (contentType.includes("pdf")) {
			// For PDFs, always estimate page count from file size
			// PDF.js requires the full buffer to get page count, which fails for large files
			// Since we can't load the buffer anyway for files over MEMORY_LIMIT_MB, just estimate
			// Average PDF page is ~100-200KB, use conservative estimate
			const ESTIMATED_PAGE_SIZE_KB = 150; // Conservative estimate
			const totalPages = Math.max(
				1,
				Math.ceil((fileSizeMB * 1024) / ESTIMATED_PAGE_SIZE_KB)
			);

			chunks = this.pdfChunkingService.calculatePageRanges(
				totalPages,
				fileSizeMB
			);
		} else {
			// For non-PDFs, create byte-range chunks
			const BYTES_PER_CHUNK = 10 * 1024 * 1024; // 10MB per chunk
			const totalChunks = Math.ceil(fileSize / BYTES_PER_CHUNK);

			for (let i = 0; i < totalChunks; i++) {
				const startByte = i * BYTES_PER_CHUNK;
				const endByte = Math.min((i + 1) * BYTES_PER_CHUNK, fileSize);

				chunks.push({
					chunkIndex: i,
					totalChunks,
					byteRangeStart: startByte,
					byteRangeEnd: endByte,
				});
			}
		}

		// Create database entries for all chunks
		for (const chunk of chunks) {
			const chunkId = this.generateChunkId(fileKey, chunk.chunkIndex);
			await this.fileDAO.createFileProcessingChunk({
				id: chunkId,
				fileKey,
				username,
				chunkIndex: chunk.chunkIndex,
				totalChunks: chunk.totalChunks,
				pageRangeStart: chunk.pageRangeStart,
				pageRangeEnd: chunk.pageRangeEnd,
				byteRangeStart: chunk.byteRangeStart,
				byteRangeEnd: chunk.byteRangeEnd,
			});
		}

		return chunks;
	}

	/**
	 * Process a single chunk
	 */
	async processChunk(
		chunkId: string,
		_fileKey: string,
		chunkDefinition: ChunkDefinition,
		fileBuffer: ArrayBuffer,
		contentType: string,
		metadataId: string
	): Promise<{
		success: boolean;
		vectorId?: string;
		text?: string;
		error?: string;
	}> {
		try {
			// Update chunk status to processing
			await this.fileDAO.updateFileProcessingChunk(chunkId, {
				status: "processing",
			});

			let extractionResult: ExtractionResult;

			if (contentType.includes("pdf")) {
				// Extract PDF page range
				if (!chunkDefinition.pageRangeStart || !chunkDefinition.pageRangeEnd) {
					throw new Error("PDF chunk missing page range");
				}
				extractionResult = await extractPdfPagesRange(
					fileBuffer,
					chunkDefinition.pageRangeStart,
					chunkDefinition.pageRangeEnd
				);
			} else {
				// Extract byte range for non-PDFs
				if (
					chunkDefinition.byteRangeStart === undefined ||
					chunkDefinition.byteRangeEnd === undefined
				) {
					throw new Error("Non-PDF chunk missing byte range");
				}
				extractionResult = await this.extractionService.extractTextRange(
					fileBuffer,
					chunkDefinition.byteRangeStart,
					chunkDefinition.byteRangeEnd,
					contentType
				);
			}

			if (!extractionResult?.text) {
				throw new Error("No text extracted from chunk");
			}

			// Store embeddings for this chunk
			const embeddingService = new FileEmbeddingService(
				this.env.VECTORIZE,
				this.env.OPENAI_API_KEY,
				this.env as unknown as Record<string, unknown>
			);

			const vectorId = await embeddingService.storeEmbeddings(
				extractionResult.text,
				metadataId,
				{
					metadataId,
					type: "file_chunk",
				}
			);

			// Mark chunk as completed
			await this.fileDAO.markFileChunkComplete(chunkId, vectorId);

			return {
				success: true,
				vectorId,
				text: extractionResult.text,
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			// Update chunk status to failed
			await this.fileDAO.updateFileProcessingChunk(chunkId, {
				status: "failed",
				errorMessage,
			});

			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	/**
	 * Process a single PDF chunk using R2 range requests only (no full-file buffer).
	 * Use for large PDFs when file size exceeds Worker memory limit.
	 */
	async processPdfChunkWithR2Range(
		chunkId: string,
		fileKey: string,
		chunkDefinition: ChunkDefinition,
		fileSize: number,
		_contentType: string,
		metadataId: string
	): Promise<{
		success: boolean;
		vectorId?: string;
		text?: string;
		error?: string;
	}> {
		const log = createLogger(this.env, "[ChunkedPDFRange]");
		try {
			log.info("processPdfChunkWithR2Range start", {
				chunkId,
				fileKey,
				pageRangeStart: chunkDefinition.pageRangeStart,
				pageRangeEnd: chunkDefinition.pageRangeEnd,
				fileSize,
			});
			await this.fileDAO.updateFileProcessingChunk(chunkId, {
				status: "processing",
			});

			if (!chunkDefinition.pageRangeStart || !chunkDefinition.pageRangeEnd) {
				throw new Error("PDF chunk missing page range");
			}

			const extractionResult = await extractPdfPagesRangeFromR2(
				this.env.R2,
				fileKey,
				fileSize,
				chunkDefinition.pageRangeStart,
				chunkDefinition.pageRangeEnd
			);

			if (!extractionResult?.text) {
				throw new Error("No text extracted from chunk");
			}

			const embeddingService = new FileEmbeddingService(
				this.env.VECTORIZE,
				this.env.OPENAI_API_KEY,
				this.env as unknown as Record<string, unknown>
			);

			const vectorId = await embeddingService.storeEmbeddings(
				extractionResult.text,
				metadataId,
				{
					metadataId,
					type: "file_chunk",
				}
			);

			await this.fileDAO.markFileChunkComplete(chunkId, vectorId);

			return {
				success: true,
				vectorId,
				text: extractionResult.text,
			};
		} catch (error) {
			const errorMessage =
				error instanceof MemoryLimitError
					? `MEMORY_LIMIT_EXCEEDED: ${error.message}`
					: error instanceof Error
						? error.message
						: String(error);
			log.error("processPdfChunkWithR2Range failed", error, {
				chunkId,
				fileKey,
				errorMessage,
			});
			await this.fileDAO.updateFileProcessingChunk(chunkId, {
				status: "failed",
				errorMessage,
			});
			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	/**
	 * Merge chunk results and check if all chunks are complete.
	 * When there are failures, returns the first failed chunk's error_message so callers
	 * can set file-level error codes (e.g. MEMORY_LIMIT_EXCEEDED).
	 */
	async mergeChunkResults(fileKey: string): Promise<{
		allComplete: boolean;
		allSuccessful: boolean;
		firstFailedErrorMessage: string | null;
		stats: {
			total: number;
			completed: number;
			failed: number;
			pending: number;
			processing: number;
		};
	}> {
		const stats = await this.fileDAO.getFileChunkStats(fileKey);
		const allComplete = stats.completed + stats.failed === stats.total;
		const allSuccessful = stats.completed === stats.total && stats.failed === 0;

		let firstFailedErrorMessage: string | null = null;
		if (stats.failed > 0) {
			const chunks = await this.fileDAO.getFileProcessingChunks(fileKey);
			const failed = chunks.find((c) => c.status === "failed");
			if (failed?.errorMessage) {
				firstFailedErrorMessage = failed.errorMessage;
			}
		}

		return {
			allComplete,
			allSuccessful,
			firstFailedErrorMessage,
			stats,
		};
	}

	/**
	 * Generate a unique chunk ID
	 */
	private generateChunkId(fileKey: string, chunkIndex: number): string {
		const timestamp = Date.now();
		const randomSuffix = Math.random().toString(36).substr(2, 9);
		// Create a safe ID from fileKey (replace slashes and special chars)
		const safeFileKey = fileKey.replace(/[^a-zA-Z0-9]/g, "_");
		return `chunk_${safeFileKey}_${chunkIndex}_${timestamp}_${randomSuffix}`;
	}
}
