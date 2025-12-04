// Library RAG Service - Vector-based RAG for user library files
// This service handles text extraction, embedding generation, and semantic vector search
// Uses Vectorize for embeddings and Cloudflare AI for content generation

import type { Env } from "@/middleware/auth";
import type { FileMetadata, SearchQuery, SearchResult } from "@/types/upload";
import { BaseRAGService } from "./base-rag-service";
import { FileNotFoundError, MemoryLimitError } from "@/lib/errors";
import { FileExtractionService } from "@/services/file/file-extraction-service";
import { FileEmbeddingService } from "@/services/embedding/file-embedding-service";
import { LibraryMetadataService } from "@/services/file/library-metadata-service";
import { FileQueueUtils } from "@/services/file/file-queue-utils";
import { LibrarySearchService } from "@/services/file/library-search-service";
import { LibraryContentSearchService } from "@/services/file/library-content-search-service";
import { LibraryFileMetadataService } from "@/services/file/library-file-metadata-service";
import { ChunkedProcessingService } from "@/services/file/chunked-processing-service";

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
    super(env.DB, env.VECTORIZE, env.OPENAI_API_KEY || "", env);
    this.extractionService = new FileExtractionService();
    this.embeddingService = new FileEmbeddingService(env.VECTORIZE, env.AI);
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
    try {
      const file = await this.env.R2.get(metadata.fileKey);
      if (!file) {
        throw new FileNotFoundError(metadata.fileKey);
      }

      const fileSizeMB = (file.size || 0) / (1024 * 1024);
      const MEMORY_LIMIT_MB = 128;

      // Check if file already has processing chunks (retry scenario)
      if (
        await this.chunkedProcessingService.hasExistingChunks(metadata.fileKey)
      ) {
        console.log(
          `[LibraryRAGService] File ${metadata.fileKey} already has processing chunks. Chunks will be processed separately.`
        );
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
        console.log(
          `[LibraryRAGService] File ${metadata.fileKey} (${fileSizeMB.toFixed(2)}MB) exceeds memory limit. Attempting chunked processing.`
        );

        // Try to load file buffer to create chunks (may fail for very large files)
        try {
          buffer = await file.arrayBuffer();
          await this.chunkedProcessingService.createProcessingChunks(
            metadata.fileKey,
            metadata.userId,
            metadata.filename,
            metadata.contentType,
            file.size || 0,
            buffer
          );

          // Return explicit result indicating chunking started
          return {
            displayName: undefined,
            description: "",
            tags: [],
            chunked: true,
            // No vectorId - chunks will be processed separately
          };
        } catch (chunkError) {
          console.error(
            `[LibraryRAGService] Failed to create chunks for ${metadata.fileKey} (${fileSizeMB.toFixed(2)}MB). File may be too large to load even for chunking.`,
            chunkError
          );
          // If we can't even load the file to create chunks, throw memory limit error
          throw new MemoryLimitError(
            fileSizeMB,
            MEMORY_LIMIT_MB,
            metadata.fileKey,
            metadata.filename,
            `File (${fileSizeMB.toFixed(2)}MB) exceeds Worker memory limit and cannot be loaded for chunking. Consider using a smaller file or splitting the document.`
          );
        }
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
          // File exceeds memory limit during processing - try chunked processing
          console.log(
            `[LibraryRAGService] Memory limit error during processing for file ${metadata.fileKey} (${fileSizeMB.toFixed(2)}MB). Attempting chunked processing.`
          );

          // Try to create chunks if we have buffer
          try {
            if (buffer) {
              await this.chunkedProcessingService.createProcessingChunks(
                metadata.fileKey,
                metadata.userId,
                metadata.filename,
                metadata.contentType,
                file.size || 0,
                buffer
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
          } catch (chunkError) {
            console.error(
              `[LibraryRAGService] Failed to create chunks for ${metadata.fileKey}:`,
              chunkError
            );
          }

          // If chunking failed, re-throw the memory limit error
          throw memoryLimitError;
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
        console.error(
          `[LibraryRAGService] No text extracted from file: ${metadata.fileKey}. File may be corrupted, encrypted, or too large.`
        );
        throw new Error(
          `No text could be extracted from file "${metadata.filename}". The file may be corrupted, encrypted, image-based, or too large to process.`
        );
      }

      const text = extractionResult.text;

      // Log page limitation if applicable
      if (extractionResult.pagesExtracted && extractionResult.totalPages) {
        if (extractionResult.pagesExtracted < extractionResult.totalPages) {
          console.warn(
            `[LibraryRAGService] File ${metadata.fileKey} processed with partial content: ${extractionResult.pagesExtracted}/${extractionResult.totalPages} pages extracted`
          );
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
      } catch (aiError) {
        console.warn(
          "AI processing failed, falling back to basic processing:",
          aiError
        );
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

      console.log(`[LibraryRAGService] Processed file:`, {
        fileKey: metadata.fileKey,
        displayName: result.displayName,
        description: result.description,
        tags: result.tags,
        vectorId,
      });

      return {
        ...result,
        vectorId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(
        `[LibraryRAGService] Error processing file ${metadata.fileKey}:`,
        errorMessage
      );
      if (errorStack) {
        console.error(`[LibraryRAGService] Error stack:`, errorStack);
      }
      // Rethrow error so it can be properly handled upstream
      throw error;
    }
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
  async sync(): Promise<void> {
    // LibraryRAGService handles everything internally - no sync needed
    console.log(
      `[LibraryRAGService] Sync not needed - all processing is internal`
    );
  }

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

      // Extract text based on file type
      const buffer = await file.arrayBuffer();
      const extractionResult = await this.extractionService.extractText(
        buffer,
        "application/pdf"
      );

      if (!extractionResult || !extractionResult.text) {
        console.log(
          `[LibraryRAGService] No text extracted from file: ${fileKey}`
        );
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
          console.log(
            `[LibraryRAGService] Stored embeddings for ${fileKey} with vector ID: ${vectorId}`
          );
        } catch (error) {
          console.error(
            `[LibraryRAGService] Failed to store embeddings for ${fileKey}:`,
            error
          );
        }
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
    } catch (error) {
      console.error(
        `[LibraryRAGService] Error processing file from R2: ${fileKey}`,
        error
      );
      return {};
    }
  }

  protected async getChunksByIds(_ids: string[]): Promise<any[]> {
    try {
      // For now, return empty array as chunks are not yet implemented
      // This can be enhanced when chunk storage is implemented
      return [];
    } catch (error) {
      console.error(`[LibraryRAGService] Error getting chunks:`, error);
      return [];
    }
  }
}
