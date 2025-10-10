// Import AutoRAG filter types from Cloudflare SDK
import type {
  ComparisonFilter,
  CompoundFilter,
} from "@cloudflare/workers-types";

export interface AutoRAGSearchResult {
  results: Array<{
    id: string;
    score: number;
    metadata: Record<string, any>;
    text: string;
  }>;
  total: number;
}

export interface AutoRAGAISearchResult {
  response: string;
  search_query: string;
  data: Array<{
    file_id: string;
    filename: string;
    score: number;
    attributes: Record<string, string | number | boolean | null>;
    content: Array<{
      type: "text";
      text: string;
    }>;
  }>;
  has_more: boolean;
  next_page: string | null;
  object: string;
}

export interface AutoRAGStatus {
  status: "ready" | "processing" | "delayed";
  message: string;
  shardCount?: number;
  expectedShards?: number;
  lastUpdate?: string;
}

export class AutoRAGClient {
  private searchUrl: string;
  private aiSearchUrl: string;
  private apiToken: string;

  constructor(baseUrl: string, apiToken: string) {
    if (!baseUrl) {
      throw new Error(
        `AutoRAGClient constructor called with undefined or empty baseUrl. This usually means the AUTORAG_BASE_URL environment variable is not set.`
      );
    }
    if (!apiToken) {
      throw new Error(
        `AutoRAGClient constructor called with undefined or empty apiToken. This usually means the AUTORAG_API_TOKEN environment variable is not set.`
      );
    }

    // DEBUG: Log token info (masked for security)
    console.log(
      `[AutoRAGClient] Token length: ${apiToken.length}, starts with: ${apiToken.substring(0, 8)}...`
    );

    // Remove trailing slash if present
    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    this.searchUrl = `${cleanBaseUrl}/search`;
    this.aiSearchUrl = `${cleanBaseUrl}/ai-search`;
    this.apiToken = apiToken;

    console.log(`[AutoRAGClient] Constructed URLs:`, {
      baseUrl,
      cleanBaseUrl,
      searchUrl: this.searchUrl,
      aiSearchUrl: this.aiSearchUrl,
    });
  }

  /**
   * Search AutoRAG with a query
   */
  async search(
    query: string,
    options: {
      limit?: number;
      filters?: ComparisonFilter | CompoundFilter;
      probeToken?: string;
    } = {}
  ): Promise<AutoRAGSearchResult> {
    const { limit = 10, filters, probeToken } = options;

    const searchPayload: any = {
      query,
      max_num_results: limit,
    };

    if (filters) {
      searchPayload.filters = filters;
    }

    if (probeToken) {
      searchPayload.probe_token = probeToken;
    }

    const response = await fetch(this.searchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: JSON.stringify(searchPayload),
    });

    if (!response.ok) {
      throw new Error(
        `AutoRAG search failed: ${response.status} ${response.statusText}`
      );
    }

    const result = await response.json();
    return result as AutoRAGSearchResult;
  }

  /**
   * AI Search with AutoRAG using a detailed prompt
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
      filters?: ComparisonFilter | CompoundFilter;
      system_prompt?: string;
    } = {}
  ): Promise<AutoRAGAISearchResult> {
    const {
      max_results = 20,
      ranking_options = {},
      rewrite_query = false,
      filters,
      system_prompt,
    } = options;

    console.log(
      `[AutoRAGClient] Making AI Search request to: ${this.aiSearchUrl}`
    );
    console.log(`[AutoRAGClient] AI Search payload:`, {
      query: `${prompt.substring(0, 100)}...`,
      max_num_results: max_results,
      ranking_options,
      rewrite_query,
      filters,
    });

    // Build the search payload with proper metadata filtering
    const searchPayload: any = {
      query: prompt,
      max_num_results: max_results,
      ranking_options,
      rewrite_query,
    };

    // Add metadata filtering if specified
    if (filters) {
      searchPayload.filters = filters;
    }

    if (system_prompt) {
      (searchPayload as any).system_prompt = system_prompt;
    }

    const response = await fetch(this.aiSearchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: JSON.stringify(searchPayload),
    });

    if (!response.ok) {
      let bodyText = "";
      try {
        bodyText = await response.text();
      } catch (_e) {}
      console.error(
        "[AutoRAGClient] AI search error body:",
        bodyText?.slice(0, 400)
      );
      throw new Error(
        `AutoRAG AI search failed: ${response.status} ${response.statusText}`
      );
    }

    const result = await response.json();
    return result as AutoRAGAISearchResult;
  }

  /**
   * Check AutoRAG status by searching for a probe token
   */
  async checkStatus(
    probeToken: string,
    expectedShards?: number
  ): Promise<AutoRAGStatus> {
    try {
      // Search for the probe token to see if files are indexed
      const searchResult = await this.search(probeToken, {
        limit: 1,
        probeToken,
      });

      if (searchResult.total > 0) {
        return {
          status: "ready",
          message: "Files are indexed and searchable",
          shardCount: searchResult.total,
          expectedShards,
          lastUpdate: new Date().toISOString(),
        };
      }

      // If no results found, files are still processing
      return {
        status: "processing",
        message: "Files are uploaded but not yet indexed",
        expectedShards,
        lastUpdate: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[AutoRAGClient] Error checking status:", error);
      return {
        status: "delayed",
        message: `Error checking status: ${error instanceof Error ? error.message : "Unknown error"}`,
        expectedShards,
        lastUpdate: new Date().toISOString(),
      };
    }
  }

  /**
   * Get AutoRAG health status
   */
  async getHealth(): Promise<{
    status: "healthy" | "unhealthy";
    message: string;
    timestamp: string;
  }> {
    try {
      const response = await fetch(
        `${this.searchUrl.replace("/search", "/health")}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        return {
          status: "healthy",
          message: "AutoRAG service is responding",
          timestamp: new Date().toISOString(),
        };
      } else {
        return {
          status: "unhealthy",
          message: `AutoRAG service returned ${response.status}`,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      return {
        status: "unhealthy",
        message: `AutoRAG service error: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
