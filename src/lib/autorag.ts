export interface AutoRAGSearchResult {
  results: Array<{
    id: string;
    score: number;
    metadata: Record<string, any>;
    text: string;
  }>;
  total: number;
}

export interface AutoRAGStatus {
  status: "ready" | "processing" | "delayed";
  message: string;
  shardCount?: number;
  expectedShards?: number;
  lastUpdate?: string;
}

export class AutoRAGClient {
  constructor(private searchUrl: string) {}

  /**
   * Search AutoRAG with a query
   */
  async search(
    query: string,
    options: {
      limit?: number;
      folder?: string;
      probeToken?: string;
    } = {}
  ): Promise<AutoRAGSearchResult> {
    const { limit = 10, folder, probeToken } = options;

    const searchParams = new URLSearchParams({
      query,
      limit: limit.toString(),
    });

    if (folder) {
      searchParams.append("folder", folder);
    }

    if (probeToken) {
      searchParams.append("probe_token", probeToken);
    }

    const response = await fetch(
      `${this.searchUrl}?${searchParams.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `AutoRAG search failed: ${response.status} ${response.statusText}`
      );
    }

    const result = await response.json();
    return result as AutoRAGSearchResult;
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
