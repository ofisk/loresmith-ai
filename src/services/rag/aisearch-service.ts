// Centralized AutoRAG AI Search Service
// Consolidates all aiSearch calls to prevent path filtering bugs

import { getLibraryAutoRAGService } from "@/lib/service-factory";
import { RPG_EXTRACTION_PROMPTS } from "@/lib/prompts/rpg-extraction-prompts";
import { getFileExistencePrompt } from "@/lib/prompts/file-indexing-prompts";

export interface AISearchOptions {
  maxResults?: number;
  rewriteQuery?: boolean;
  filters?: any; // AutoRAG filter type
  systemPrompt?: string;
  usePathFilter?: boolean; // Default: true for file-specific searches
}

export interface CampaignContextSearchOptions extends AISearchOptions {
  entityType?: string;
}

export class AISearchService {
  /**
   * Search library content with proper path filtering
   */
  static async searchLibrary(
    env: any,
    username: string,
    query: string,
    options: AISearchOptions = {}
  ) {
    const ragService = getLibraryAutoRAGService(env, username);
    return await ragService.aiSearch(query, {
      max_results: options.maxResults || 10,
      rewrite_query: options.rewriteQuery || false,
      filters: options.filters,
      system_prompt: options.systemPrompt,
    });
  }

  /**
   * Search for specific file content with proper path filtering
   * This is the main method that was causing the bug - now centralized
   */
  static async searchFileContent(
    env: any,
    username: string,
    query: string,
    filePath: string,
    options: AISearchOptions = {}
  ) {
    const ragService = getLibraryAutoRAGService(env, username);

    // Always use path filter for file-specific searches to prevent the bug
    const usePathFilter = options.usePathFilter !== false;

    const searchOptions: any = {
      max_results: options.maxResults || 50,
      rewrite_query: options.rewriteQuery || false,
      system_prompt: options.systemPrompt,
    };

    if (usePathFilter) {
      // Use path filter to prevent "No relevant documents" errors
      searchOptions.filters = {
        type: "eq",
        key: "path",
        value: filePath,
      };
    } else if (options.filters) {
      searchOptions.filters = options.filters;
    }

    console.log(
      `[CentralizedAISearch] Searching file content with path filter: ${filePath}`
    );

    return await ragService.aiSearch(query, searchOptions);
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
   * Check if a file exists in AutoRAG (general search, no path filter needed)
   */
  static async checkFileExists(env: any, username: string, fileKey: string) {
    const filename = fileKey.split("/").pop() || "";
    const ragService = getLibraryAutoRAGService(env, username);

    console.log(`[CentralizedAISearch] Checking if file exists: ${filename}`);

    return await ragService.aiSearch(getFileExistencePrompt(filename), {
      max_results: 1,
    });
  }

  /**
   * Search campaign context with entity type filtering
   * TODO: Replace with graph-based entity search
   * Entities are now stored in D1 graph, not R2
   * This method needs to be updated to search through the entity graph using EntityDAO/EntityGraphService
   */
  static async searchCampaignContext(
    _env: any,
    _campaignRagBasePath: string,
    query: string,
    _options: CampaignContextSearchOptions = {}
  ) {
    console.warn(
      `[CentralizedAISearch] searchCampaignContext is deprecated - entities are now in D1 graph, not R2. ` +
        `Need to implement graph-based search. Query: ${query}`
    );

    // Return empty result for now - needs graph search implementation
    return {
      response: "",
      data: [],
      metadata: {},
    };
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
