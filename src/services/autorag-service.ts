// AutoRAG service for managing AutoRAG operations
// This service handles sync operations and job tracking

import { API_CONFIG } from "../shared";
import { authenticatedFetchWithExpiration, AuthService } from "./auth-service";

export class AutoRAGService {
  /**
   * Trigger AutoRAG sync for a specific RAG resource
   * Returns the job_id for tracking the sync progress
   */
  static async triggerSync(ragId: string): Promise<string> {
    try {
      const jwt = AuthService.getStoredJwt();
      if (!jwt) {
        throw new Error("No authentication token found");
      }

      const response = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTORAG.SYNC(ragId)),
        {
          method: "PATCH",
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
          `AutoRAG sync failed: ${response.response.status} ${errorText}`
        );
      }

      const result = (await response.response.json()) as {
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
