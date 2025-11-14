// Content extraction provider interface
// Allows swapping between different content extraction mechanisms (AutoRAG, direct file reading, etc.)
export interface ContentExtractionOptions {
  resource: {
    id: string;
    file_name?: string | null;
    file_key?: string | null;
  };
  searchPath: string;
  maxResults?: number;
}

export interface ContentExtractionResult {
  content: string;
  success: boolean;
  error?: string;
}

/**
 * Abstract interface for content extraction providers
 * Implementations can use AutoRAG, direct file reading, or other methods
 */
export interface ContentExtractionProvider {
  /**
   * Extract text content from a resource
   * @param options - Options for content extraction
   * @returns Extracted text content or empty string if extraction fails
   */
  extractContent(
    options: ContentExtractionOptions
  ): Promise<ContentExtractionResult>;
}
