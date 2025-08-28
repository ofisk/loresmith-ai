import { AutoRAGClient } from "../lib/autorag";
import type { AutoRAGAISearchResult } from "../lib/autorag";
import { R2Helper } from "../lib/r2";
import type { Env } from "../middleware/auth";

export interface AutoRAGSearchOptions {
  limit?: number;
  folder?: string;
  probeToken?: string;
}

export interface AutoRAGSearchResult {
  results: Array<{
    id: string;
    score: number;
    metadata: Record<string, any>;
    text: string;
  }>;
  total: number;
}

/**
 * Abstract base class for AutoRAG client services
 * Provides shared functionality for Library and Campaign AutoRAG implementations
 */
export abstract class AutoRAGClientBase {
  protected autoRagClient!: AutoRAGClient;
  protected r2Helper: R2Helper;
  protected env: Env;
  private initPromise: Promise<void>;

  constructor(env: Env, baseUrl: string) {
    this.env = env;
    this.r2Helper = new R2Helper(env);

    // Start initialization immediately
    this.initPromise = this.initialize(baseUrl);
  }

  private async initialize(baseUrl: string): Promise<void> {
    const apiToken =
      typeof this.env.AUTORAG_API_TOKEN === "string"
        ? this.env.AUTORAG_API_TOKEN
        : await this.env.AUTORAG_API_TOKEN.get();

    this.autoRagClient = new AutoRAGClient(baseUrl, apiToken);
  }

  protected async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  /**
   * Sync with AutoRAG (delegates to the client)
   */
  async sync(): Promise<void> {
    // AutoRAG syncs automatically - this is a placeholder for future sync operations
    console.log("[AutoRAGClientBase] AutoRAG sync is automatic");
  }

  /**
   * Search with enforced filtering
   * Merges caller filters with enforcedFilter() from subclasses
   */
  async search(
    query: string,
    options: AutoRAGSearchOptions = {}
  ): Promise<AutoRAGSearchResult> {
    await this.ensureInitialized();

    const enforcedFilter = this.enforcedFilter();

    // Merge filters - if both exist, combine with logical AND
    const mergedOptions = { ...options };
    if (enforcedFilter && options.folder) {
      // For now, we'll use the enforced filter as the primary folder
      // In a more complex implementation, we could combine multiple folder filters
      mergedOptions.folder = enforcedFilter;
    } else if (enforcedFilter) {
      mergedOptions.folder = enforcedFilter;
    }

    console.log("[AutoRAGClientBase] Searching with options:", mergedOptions);
    return await this.autoRagClient.search(query, mergedOptions);
  }

  /**
   * AI Search with detailed prompt for structured content extraction
   * This method sends a detailed prompt to AutoRAG and gets structured content back
   */
  async aiSearch(
    prompt: string,
    options: {
      max_results?: number;
      ranking_options?: {
        ranker?: string;
        score_threshold?: number;
      };
      rewrite_query?: boolean;
    } = {}
  ): Promise<AutoRAGAISearchResult> {
    await this.ensureInitialized();

    console.log(
      "[AutoRAGClientBase] AI Searching with prompt:",
      prompt.substring(0, 100) + "..."
    );
    return await this.autoRagClient.aiSearch(prompt, options);
  }

  /**
   * Ensure folders exist by creating marker objects
   * @param basePath - Base path for the folders
   * @param subs - Array of subfolder names
   */
  async ensureFolders(basePath: string, subs: string[]): Promise<void> {
    console.log(
      `[AutoRAGClientBase] Ensuring folders for base path: ${basePath}`
    );

    for (const sub of subs) {
      const folderPath = `${basePath}/${sub}/`;
      const initMarker = `${folderPath}.init`;
      const keepMarker = `${folderPath}.keep`;

      // Create .init marker if it doesn't exist
      if (!(await this.r2Helper.exists(initMarker))) {
        const initContent = JSON.stringify({
          created_at: new Date().toISOString(),
          purpose: "folder_init_marker",
          subfolder: sub,
        });

        await this.r2Helper.put(
          initMarker,
          new TextEncoder().encode(initContent).buffer,
          "application/json"
        );

        console.log(`[AutoRAGClientBase] Created init marker: ${initMarker}`);
      }

      // Create .keep marker if it doesn't exist
      if (!(await this.r2Helper.exists(keepMarker))) {
        const keepContent = JSON.stringify({
          created_at: new Date().toISOString(),
          purpose: "folder_keep_marker",
          subfolder: sub,
        });

        await this.r2Helper.put(
          keepMarker,
          new TextEncoder().encode(keepContent).buffer,
          "application/json"
        );

        console.log(`[AutoRAGClientBase] Created keep marker: ${keepMarker}`);
      }
    }
  }

  /**
   * Protected method that subclasses must implement to provide enforced filtering
   * This ensures server-side folder filtering for security
   */
  protected abstract enforcedFilter(): string | null;
}
