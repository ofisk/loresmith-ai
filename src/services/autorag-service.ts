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
    const startTime = Date.now();
    try {
      console.log(
        `[DEBUG] [AutoRAGService] ===== TRIGGERING AUTORAG SYNC =====`
      );
      console.log(`[DEBUG] [AutoRAGService] RAG ID: ${ragId}`);
      console.log(`[DEBUG] [AutoRAGService] Retry Count: ${retryCount}`);
      console.log(
        `[DEBUG] [AutoRAGService] JWT Present: ${jwt ? "YES" : "NO"}`
      );
      console.log(
        `[DEBUG] [AutoRAGService] Env Present: ${env ? "YES" : "NO"}`
      );
      console.log(
        `[DEBUG] [AutoRAGService] Timestamp: ${new Date().toISOString()}`
      );

      if (!env?.AUTORAG_API_TOKEN) {
        throw new Error("No AutoRAG API token found in environment");
      }

      // Get the Cloudflare API token (could be a string or a KV binding)
      console.log(`[DEBUG] [AutoRAGService] Getting AutoRAG API token...`);
      let cloudflareApiToken: string;
      if (typeof env.AUTORAG_API_TOKEN === "string") {
        cloudflareApiToken = env.AUTORAG_API_TOKEN;
        console.log(`[DEBUG] [AutoRAGService] API token is string type`);
      } else {
        cloudflareApiToken = await env.AUTORAG_API_TOKEN.get();
        console.log(`[DEBUG] [AutoRAGService] API token retrieved from KV`);
      }

      if (!cloudflareApiToken) {
        throw new Error("AutoRAG API token is empty or not accessible");
      }
      console.log(
        `[DEBUG] [AutoRAGService] API token retrieved successfully (length: ${cloudflareApiToken.length})`
      );

      const accountId =
        env?.AUTORAG_ACCOUNT_ID || "f67932e71175b3ee7c945c6bb84c5259";
      console.log(`[DEBUG] [AutoRAGService] Account ID: ${accountId}`);

      const syncUrl = API_CONFIG.ENDPOINTS.AUTORAG.API.SYNC(accountId, ragId);
      console.log(`[DEBUG] [AutoRAGService] Sync URL: ${syncUrl}`);

      // Use direct fetch with Cloudflare API token instead of authenticatedFetchWithExpiration
      console.log(
        `[DEBUG] [AutoRAGService] Making PATCH request to AutoRAG API...`
      );
      const response = await fetch(syncUrl, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cloudflareApiToken}`,
        },
      });

      console.log(
        `[DEBUG] [AutoRAGService] Response status: ${response.status}`
      );
      console.log(`[DEBUG] [AutoRAGService] Response ok: ${response.ok}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[DEBUG] [AutoRAGService] Response not ok - Status: ${response.status}`
        );
        console.error(`[DEBUG] [AutoRAGService] Error text: ${errorText}`);

        // Check if this is a rate limiting error and we should retry
        if (response.status === 429 && retryCount < 3) {
          const delay = 2 ** retryCount * 1000; // Exponential backoff: 1s, 2s, 4s
          console.log(
            `[DEBUG] [AutoRAGService] Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/3)`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return AutoRAGService.triggerSync(ragId, retryCount + 1, jwt, env);
        }

        throw new Error(`AutoRAG sync failed: ${response.status} ${errorText}`);
      }

      console.log(`[DEBUG] [AutoRAGService] Response ok, parsing JSON...`);
      const result = (await response.json()) as {
        success: boolean;
        result: { job_id: string };
      };

      console.log(
        `[DEBUG] [AutoRAGService] Parsed response:`,
        JSON.stringify(result, null, 2)
      );

      if (!result.success || !result.result.job_id) {
        throw new Error("Failed to get job_id from AutoRAG sync response");
      }

      const endTime = Date.now();
      const duration = endTime - startTime;
      console.log(
        `[DEBUG] [AutoRAGService] ===== AUTORAG SYNC TRIGGERED SUCCESSFULLY =====`
      );
      console.log(`[DEBUG] [AutoRAGService] Duration: ${duration}ms`);
      console.log(`[DEBUG] [AutoRAGService] Job ID: ${result.result.job_id}`);
      console.log(`[DEBUG] [AutoRAGService] Status: SUCCESS`);

      return result.result.job_id;
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      console.error(`[DEBUG] [AutoRAGService] ===== AUTORAG SYNC FAILED =====`);
      console.error(`[DEBUG] [AutoRAGService] Duration: ${duration}ms`);
      console.error(`[DEBUG] [AutoRAGService] Error:`, error);
      console.error(
        `[DEBUG] [AutoRAGService] Error message:`,
        error instanceof Error ? error.message : String(error)
      );
      console.error(
        `[DEBUG] [AutoRAGService] Error stack:`,
        error instanceof Error ? error.stack : "No stack trace"
      );
      console.error(`[DEBUG] [AutoRAGService] Status: FAILED`);
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
