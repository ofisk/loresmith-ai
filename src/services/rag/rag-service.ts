// Library RAG Service - Vector-based RAG for user library files
// This service handles text extraction, embedding generation, and semantic vector search
// Uses Vectorize for embeddings and Cloudflare AI for content generation

import { PROCESSING_LIMITS } from "@/app-constants";
import { FileNotFoundError, MemoryLimitError } from "@/lib/errors";
import type { Env } from "@/middleware/auth";
import { FileEmbeddingService } from "@/services/embedding/file-embedding-service";
import { ChunkedProcessingService } from "@/services/file/chunked-processing-service";
import { FileExtractionService } from "@/services/file/file-extraction-service";
import { FileQueueUtils } from "@/services/file/file-queue-utils";
import { LibraryContentSearchService } from "@/services/file/library-content-search-service";
import { LibraryFileMetadataService } from "@/services/file/library-file-metadata-service";
import { LibraryMetadataService } from "@/services/file/library-metadata-service";
import { LibrarySearchService } from "@/services/file/library-search-service";
import type { FileMetadata, SearchQuery, SearchResult } from "@/types/upload";
import { BaseRAGService } from "./base-rag-service";

export class LibraryRAGService extends BaseRAGService {
	private extractionService: FileExtractionService;
	private embeddingService: FileEmbeddingService;
	private metadataService: LibraryMetadataService;
	private queueUtils: FileQueueUtils;
	private searchService: LibrarySearchService;
	private contentSearchService: LibraryContentSearchService;
	private fileMetadataService: LibraryFileMetadataService;
	private chunkedProcessingService: ChunkedProcessingService;

	constructor(env: Env) {
		super(env.DB, env.VECTORIZE, env.OPENAI_API_KEY, env);
		const openAIApiKey =
			typeof env.OPENAI_API_KEY === "string" ? env.OPENAI_API_KEY : undefined;
		this.extractionService = new FileExtractionService(openAIApiKey);
		this.embeddingService = new FileEmbeddingService(
			env.VECTORIZE,
			env.OPENAI_API_KEY,
			env as unknown as Record<string, unknown>
		);
		this.metadataService = new LibraryMetadataService(env);
		this.queueUtils = new FileQueueUtils();
		this.searchService = new LibrarySearchService(env);
		this.contentSearchService = new LibraryContentSearchService(env);
		this.fileMetadataService = new LibraryFileMetadataService(env);
		this.chunkedProcessingService = new ChunkedProcessingService(env);
	}

	/**
	 * Check if a file should be queued for background processing
	 * Large files (>100MB) should be queued to avoid timeout during processing
	 * For PDFs >100MB with >500 pages, we also queue to avoid extraction timeout
	 */
	async shouldQueueFile(
		file: { size?: number; arrayBuffer(): Promise<ArrayBuffer> },
		contentType: string
	): Promise<{ shouldQueue: boolean; reason?: string }> {
		return this.queueUtils.shouldQueueFile(file as any, contentType);
	}

	async processFile(metadata: FileMetadata): Promise<{
		displayName?: string;
		description: string;
		tags: string[];
		vectorId?: string;
		chunked?: boolean; // Explicit flag indicating file was split into chunks for processing
	}> {
		const file = await this.env.R2.get(metadata.fileKey);
		if (!file) {
			throw new FileNotFoundError(metadata.fileKey);
		}

		const fileSizeMB = (file.size || 0) / (1024 * 1024);
		const MEMORY_LIMIT_MB = PROCESSING_LIMITS.MEMORY_LIMIT_MB;

		// Check if file already has processing chunks (retry scenario)
		if (
			await this.chunkedProcessingService.hasExistingChunks(metadata.fileKey)
		) {
			// Return explicit result - chunks will be processed by queue
			return {
				displayName: undefined,
				description: "",
				tags: [],
				chunked: true,
				// No vectorId - chunks will be processed separately
			};
		}

		// Proactively check if file exceeds memory limit before attempting to load
		let buffer: ArrayBuffer | undefined;
		if (fileSizeMB > MEMORY_LIMIT_MB) {
			// Try to create chunks - may need buffer for page count, but can estimate from file size if buffer unavailable
			let bufferForChunking: ArrayBuffer | undefined;
			try {
				// Try to load buffer for more accurate chunking (page count for PDFs)
				bufferForChunking = await file.arrayBuffer();
			} catch (_bufferError) {
				// Continue without buffer - chunks will be estimated from file size
			}

			// Create chunks (will estimate from file size if buffer unavailable)
			await this.chunkedProcessingService.createProcessingChunks(
				metadata.fileKey,
				metadata.userId,
				metadata.filename,
				metadata.contentType,
				file.size || 0,
				bufferForChunking
			);

			// Return explicit result indicating chunking started
			return {
				displayName: undefined,
				description: "",
				tags: [],
				chunked: true,
				// No vectorId - chunks will be processed separately
			};
		}

		// Extract text based on file type
		let extractionResult: any = null;

		try {
			// Load buffer if not already loaded (for files under memory limit)
			if (!buffer) {
				buffer = await file.arrayBuffer();
			}
			extractionResult = await this.extractionService.extractText(
				buffer!,
				metadata.contentType
			);
		} catch (memoryError) {
			// Check if this is a memory limit error from Worker runtime
			const memoryLimitError = MemoryLimitError.fromRuntimeError(
				memoryError,
				fileSizeMB,
				MEMORY_LIMIT_MB,
				metadata.fileKey,
				metadata.filename
			);

			if (memoryLimitError) {
				// Try to create chunks (will use buffer if available, otherwise estimate from file size)
				try {
					await this.chunkedProcessingService.createProcessingChunks(
						metadata.fileKey,
						metadata.userId,
						metadata.filename,
						metadata.contentType,
						file.size || 0,
						buffer // May be undefined if loading failed
					);

					// Return explicit result indicating chunking started
					return {
						displayName: undefined,
						description: "",
						tags: [],
						chunked: true,
						// No vectorId - chunks will be processed separately
					};
				} catch (_chunkError) {
					// If chunking failed, re-throw the memory limit error
					throw memoryLimitError;
				}
			}

			// Check for structured MemoryLimitError from extraction service
			if (memoryError instanceof MemoryLimitError) {
				// Re-throw with file metadata included
				throw new MemoryLimitError(
					memoryError.fileSizeMB,
					memoryError.memoryLimitMB,
					metadata.fileKey,
					metadata.filename,
					memoryError.message
				);
			}
			// For other errors during extraction, rethrow
			throw memoryError;
		}

		if (
			!extractionResult ||
			!extractionResult.text ||
			extractionResult.text.trim().length === 0
		) {
			throw new Error(
				`No text could be extracted from file "${metadata.filename}". The file may be corrupted, encrypted, image-based, or too large to process.`
			);
		}

		const text = extractionResult.text;

		// Log page limitation if applicable
		if (extractionResult.pagesExtracted && extractionResult.totalPages) {
			if (extractionResult.pagesExtracted < extractionResult.totalPages) {
			}
		}

		// Use AI for enhanced metadata generation if available
		let result: { displayName?: string; description: string; tags: string[] };
		try {
			if (this.env.AI) {
				// Generate semantic metadata using AI with file content
				const semanticResult =
					await this.metadataService.generateSemanticMetadata(
						metadata.filename,
						metadata.fileKey,
						metadata.userId,
						text
					);

				if (semanticResult) {
					result = semanticResult;
				} else {
					// No meaningful metadata generated - leave blank
					result = {
						displayName: undefined,
						description: "",
						tags: [],
					};
				}
			} else {
				result = {
					displayName: undefined,
					description: "",
					tags: [],
				};
			}
		} catch (_aiError) {
			result = {
				displayName: undefined,
				description: "",
				tags: [],
			};
		}

		// Store embeddings for search
		const vectorId = await this.embeddingService.storeEmbeddings(
			text,
			metadata.id
		);

		return {
			...result,
			vectorId,
		};
	}

	async searchFiles(query: SearchQuery): Promise<SearchResult[]> {
		return this.searchService.searchFiles(query);
	}

	async getFileMetadata(
		fileKey: string,
		username: string
	): Promise<FileMetadata | null> {
		return this.fileMetadataService.getFileMetadata(fileKey, username);
	}

	async updateFileMetadata(
		fileId: string,
		userId: string,
		updates: Partial<FileMetadata>
	): Promise<boolean> {
		return this.fileMetadataService.updateFileMetadata(fileId, userId, updates);
	}

	async getUserFiles(username: string): Promise<any[]> {
		return this.fileMetadataService.getUserFiles(username);
	}

	async searchContent(
		_username: string,
		query: string,
		_limit: number = 10
	): Promise<any[]> {
		return this.contentSearchService.searchContent(query);
	}

	/**
	 * Sync - no external service to sync with
	 */
	async sync(): Promise<void> {}

	async processFileFromR2(
		fileKey: string,
		username: string,
		fileBucket: any,
		metadata: any
	): Promise<{
		suggestedMetadata?: {
			displayName?: string;
			description: string;
			tags: string[];
		};
		vectorId?: string;
	}> {
		try {
			// Get file from R2
			const file = await fileBucket.get(fileKey);
			if (!file) {
				throw new FileNotFoundError(fileKey);
			}

			// Extract text based on file type (use stored metadata; fallback to PDF for legacy records missing content_type)
			const buffer = await file.arrayBuffer();
			const contentType =
				metadata.content_type ||
				metadata.contentType ||
				file.httpMetadata?.contentType ||
				"application/pdf";
			const extractionResult = await this.extractionService.extractText(
				buffer,
				contentType
			);

			if (!extractionResult || !extractionResult.text) {
				return {};
			}

			const text = extractionResult.text;

			// Generate semantic metadata using AI
			const semanticResult =
				await this.metadataService.generateSemanticMetadata(
					metadata.filename || fileKey,
					fileKey,
					username,
					text
				);

			// Store embeddings in Vectorize if available
			let vectorId: string | undefined;
			if (this.vectorize && text) {
				try {
					vectorId = await this.embeddingService.storeEmbeddings(
						text,
						metadata.id || fileKey
					);
				} catch (_error) {}
			}

			if (semanticResult) {
				return {
					suggestedMetadata: {
						displayName: semanticResult.displayName,
						description: semanticResult.description,
						tags: semanticResult.tags,
					},
					vectorId,
				};
			}

			return { vectorId };
		} catch (_error) {
			return {};
		}
	}

	protected async getChunksByIds(_ids: string[]): Promise<any[]> {
		try {
			// For now, return empty array as chunks are not yet implemented
			// This can be enhanced when chunk storage is implemented
			return [];
		} catch (_error) {
			return [];
		}
	}
}
