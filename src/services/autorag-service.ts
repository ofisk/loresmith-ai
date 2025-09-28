// AutoRAG service for managing AutoRAG operations
// This service handles sync operations and job tracking

import { API_CONFIG } from "../shared-config";
import { AuthService, authenticatedFetchWithExpiration } from "./auth-service";

export class AutoRAGService {
  /**
   * Trigger AutoRAG sync for a specific RAG resource
   * Returns the job_id for tracking the sync progress
   */
  static async triggerSync(
    ragId: string,
    retryCount = 0,
    jwt?: string,
    env?: any
  ): Promise<string> {
    try {
      if (!env?.AUTORAG_API_TOKEN) {
        throw new Error("No AutoRAG API token found in environment");
      }

      // Get the Cloudflare API token (could be a string or a KV binding)
      let cloudflareApiToken: string;
      if (typeof env.AUTORAG_API_TOKEN === "string") {
        cloudflareApiToken = env.AUTORAG_API_TOKEN;
      } else {
        cloudflareApiToken = await env.AUTORAG_API_TOKEN.get();
      }

      if (!cloudflareApiToken) {
        throw new Error("AutoRAG API token is empty or not accessible");
      }

      const accountId =
        env?.AUTORAG_ACCOUNT_ID || "f67932e71175b3ee7c945c6bb84c5259";

      // Use direct fetch with Cloudflare API token instead of authenticatedFetchWithExpiration
      const response = await fetch(
        API_CONFIG.ENDPOINTS.AUTORAG.API.SYNC(accountId, ragId),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cloudflareApiToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        // Check if this is a rate limiting error and we should retry
        if (response.status === 429 && retryCount < 3) {
          const delay = 2 ** retryCount * 1000; // Exponential backoff: 1s, 2s, 4s
          console.log(
            `[AutoRAGService] Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/3)`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return AutoRAGService.triggerSync(ragId, retryCount + 1, jwt, env);
        }

        throw new Error(`AutoRAG sync failed: ${response.status} ${errorText}`);
      }

      const result = (await response.json()) as {
        success: boolean;
        result: { job_id: string };
      };

      if (!result.success || !result.result.job_id) {
        throw new Error("Failed to get job_id from AutoRAG sync response");
      }

      console.log(
        "[AutoRAGService] AutoRAG sync triggered successfully, job_id:",
        result.result.job_id
      );
      return result.result.job_id;
    } catch (error) {
      console.error("[AutoRAGService] Error triggering AutoRAG sync:", error);
      throw error;
    }
  }

  /**
   * Get job details for a specific AutoRAG job
   */
  static async getJobDetails(ragId: string, jobId: string): Promise<any> {
    try {
      const jwt = AuthService.getStoredJwt();
      if (!jwt) {
        throw new Error("No authentication token found");
      }

      const response = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.AUTORAG.JOB_DETAILS(ragId, jobId)
        ),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          jwt,
        }
      );

      if (response.jwtExpired) {
        throw new Error("Authentication expired. Please log in again.");
      }

      if (!response.response.ok) {
        const errorText = await response.response.text();
        throw new Error(
          `Failed to get job details: ${response.response.status} ${errorText}`
        );
      }

      const result = await response.response.json();
      return result;
    } catch (error) {
      console.error("[AutoRAGService] Error getting job details:", error);
      throw error;
    }
  }
}
