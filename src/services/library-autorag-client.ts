import { AutoRAGClientBase } from "./autorag-client";

/**
 * Library AutoRAG client for searching library content
 * This service provides AutoRAG search functionality for the user's library
 */
export class LibraryAutoRAGClient extends AutoRAGClientBase {
  private username?: string;

  constructor(env: any, baseUrl: string, username?: string) {
    super(env, baseUrl);
    this.username = username;
  }

  /**
   * Enforce filtering to user's library folder
   * This ensures users can only search their own content
   */
  protected enforcedFilter(): string | null {
    // Filter to the user's autorag folder for proper document isolation
    return this.username ? `autorag/${this.username}/` : null;
  }
}
