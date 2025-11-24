// Centralized AI Search Service
// Consolidates all search calls using LibraryRAGService

import { LibraryRAGService } from "@/services/rag/rag-service";
import { RPG_EXTRACTION_PROMPTS } from "@/lib/prompts/rpg-extraction-prompts";
import { getFileExistencePrompt } from "@/lib/prompts/file-indexing-prompts";

export interface AISearchOptions {
  maxResults?: number;
  rewriteQuery?: boolean;
  systemPrompt?: string;
}

export interface CampaignContextSearchOptions extends AISearchOptions {
  entityType?: string;
}

export class AISearchService {
  /**
   * Search library content using LibraryRAGService
   */
  static async searchLibrary(
    env: any,
    username: string,
    query: string,
    options: AISearchOptions = {}
  ) {
    const ragService = new LibraryRAGService(env);
    return await ragService.searchContent(
      username,
      query,
      options.maxResults || 10
    );
  }

  /**
   * Search for specific file content using LibraryRAGService
   * Note: File-specific filtering is handled by the query itself
   */
  static async searchFileContent(
    env: any,
    username: string,
    query: string,
    filePath: string,
    options: AISearchOptions = {}
  ) {
    const ragService = new LibraryRAGService(env);

    // Include file path in query for context
    const contextualQuery = `${query} (from file: ${filePath})`;

    console.log(`[CentralizedAISearch] Searching file content: ${filePath}`);

    return await ragService.searchContent(
      username,
      contextualQuery,
      options.maxResults || 50
    );
  }

  /**
   * Extract structured content from a specific file (for shard generation)
   * This replaces executeAISearchWithRetry with proper path filtering
   */
  static async extractStructuredContent(
    env: any,
    username: string,
    filePath: string,
    maxRetries: number = 1
  ) {
    const structuredExtractionPrompt =
      RPG_EXTRACTION_PROMPTS.formatStructuredContentPrompt(filePath);

    console.log(`[AISearch] Extracting structured content from ${filePath}`);

    let lastError: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await AISearchService.searchFileContent(
          env,
          username,
          structuredExtractionPrompt,
          filePath,
          {
            maxResults: 50,
            rewriteQuery: false,
          }
        );
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          console.warn(
            `[CentralizedAISearch] Attempt ${attempt + 1} failed, retrying in 500ms:`,
            error
          );
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    throw lastError;
  }

  /**
   * Check if a file exists using LibraryRAGService
   */
  static async checkFileExists(env: any, username: string, fileKey: string) {
    const filename = fileKey.split("/").pop() || "";
    const ragService = new LibraryRAGService(env);

    console.log(`[CentralizedAISearch] Checking if file exists: ${filename}`);

    return await ragService.searchContent(
      username,
      getFileExistencePrompt(filename),
      1
    );
  }

  /**
   * General library search (no file-specific filtering)
   */
  static async searchLibraryGeneral(
    env: any,
    username: string,
    query: string,
    options: AISearchOptions = {}
  ) {
    console.log(`[CentralizedAISearch] General library search: ${query}`);

    return await AISearchService.searchLibrary(env, username, query, options);
  }
}
