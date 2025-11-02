import { AutoRAGClientBase } from "./autorag-base-service";

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
    // Filter to the user's library folder for proper document isolation
    // Files are stored at library/username/ within the R2 bucket
    return this.username
      ? `${this.env.AUTORAG_PREFIX}/${this.username}/`
      : null;
  }
}
