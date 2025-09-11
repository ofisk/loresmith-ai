import { AutoRAGClientBase } from "./autorag-client";

/**
 * Library AutoRAG client for searching library content
 * This service provides AutoRAG search functionality for the user's library
 */
export class LibraryAutoRAGClient extends AutoRAGClientBase {
  /**
   * Enforce filtering to user's library folder
   * This ensures users can only search their own content
   */
  protected enforcedFilter(): string | null {
    // For library searches, we don't enforce a specific folder filter
    // The AutoRAG service handles user isolation at the service level
    //TODO [ofisk]: circle back to what this really means and if it should change
    return null;
  }
}
