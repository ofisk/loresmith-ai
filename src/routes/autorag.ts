import type { Context } from "hono";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import { AUTORAG_CONFIG } from "../shared";
import { FileAnalysisOrchestrator } from "../services/file-analysis-orchestrator";
import { FileAnalysisService } from "../services/file-analysis-service";
import { FileDAO } from "../dao/file-dao";

async function triggerAutoRAGSync(
  env: any,
  accountId: string,
  apiUrl: string
): Promise<AutoRAGSyncResponse> {
  const syncUrl = AUTORAG_CONFIG.buildLibraryAutoRAGUrl(
    accountId,
    apiUrl,
    "/sync"
  );
  console.log(`[AutoRAG] Calling sync API: ${syncUrl}`);

  const response = await fetch(syncUrl, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.AUTORAG_API_TOKEN}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AutoRAG sync API failed: ${response.status} ${errorText}`);
  }

  return (await response.json()) as AutoRAGSyncResponse;
}

/**
 * Helper function to trigger file analysis based on available information
 */
async function triggerFileAnalysis(
  username: string,
  filename: string | undefined,
  env: any
): Promise<void> {
  try {
    const fileAnalysisService = new FileAnalysisService(env);
    const fileDAO = new FileDAO(env.DB);
    const orchestrator = new FileAnalysisOrchestrator(
      fileAnalysisService,
      fileDAO
    );

    // If we have a filename from upload, analyze only that specific file
    if (filename) {
      console.log(
        `[AutoRAG] Filename provided: ${filename}, analyzing only this file`
      );

      const fileKey = `${username}/${filename}`;
      orchestrator.analyzeFiles([fileKey], username).catch((error: any) => {
        console.error(
          `[AutoRAG] Error triggering file analysis for ${filename}:`,
          error
        );
      });
      return;
    }

    // No filename provided - fall back to analyzing all indexed files
    // In a proper workflow, the filename should be passed through each step
    console.log(
      `[AutoRAG] No filename provided, falling back to full analysis`
    );
    orchestrator
      .triggerAnalysisForIndexedFiles(username)
      .catch((error: any) => {
        console.error(`[AutoRAG] Error triggering file analysis:`, error);
      });

    console.log(`[AutoRAG] File analysis triggered for user ${username}`);
  } catch (analysisError) {
    console.warn(
      `[AutoRAG] Could not trigger file analysis after sync:`,
      analysisError
    );
    // Don't fail the sync request if analysis setup fails
  }
}

// AutoRAG API response types
interface AutoRAGSyncResponse {
  success: boolean;
  result: {
    job_id: string;
    message?: string;
  };
}

interface AutoRAGJobResponse {
  success: boolean;
  result: {
    id: string;
    source: string;
    started_at: string;
    last_seen_at?: string;
    ended_at?: string;
    end_reason?: string;
  };
}

interface AutoRAGJobLogsResponse {
  success: boolean;
  result: {
    logs: Array<{
      timestamp: string;
      level: string;
      message: string;
    }>;
  };
}

interface AutoRAGJobsResponse {
  success: boolean;
  result: {
    jobs: Array<{
      id: string;
      source: string;
      started_at: string;
      last_seen_at?: string;
      ended_at?: string;
      end_reason?: string;
    }>;
  };
}

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

/**
 * Trigger AutoRAG sync for a specific RAG resource
 * This endpoint triggers the Cloudflare AutoRAG service to process a file
 */
export async function handleAutoRAGSync(c: ContextWithAuth) {
  try {
    const ragId = c.req.param("ragId");
    const username = (c as any).userAuth.username;

    // Get filename from query params if available (from upload)
    const filename = c.req.query("filename");

    console.log(
      `[AutoRAG] Triggering sync for RAG ID: ${ragId}, user: ${username}`
    );

    // Call the Cloudflare AutoRAG sync API
    const accountId = c.env.AUTORAG_ACCOUNT_ID;
    const apiUrl = c.env.AUTORAG_API_URL;

    if (!accountId || !apiUrl) {
      throw new Error("AutoRAG configuration missing: ACCOUNT_ID or API_URL");
    }

    // Trigger AutoRAG sync
    const result = await triggerAutoRAGSync(c.env, accountId, apiUrl);
    console.log(`[AutoRAG] Sync API response:`, result);

    if (!result.success || !result.result?.job_id) {
      throw new Error("Invalid response from AutoRAG sync API: missing job_id");
    }

    console.log(
      `[AutoRAG] Sync triggered successfully, job_id: ${result.result.job_id}`
    );

    // Automatically trigger file analysis after successful sync
    await triggerFileAnalysis(username, filename, c.env);

    return c.json({
      success: true,
      result: {
        job_id: result.result.job_id,
        message: "AutoRAG sync triggered successfully",
      },
    });
  } catch (error) {
    console.error("[AutoRAG] Error triggering sync:", error);
    return c.json(
      {
        success: false,
        error: `Failed to trigger AutoRAG sync: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      500
    );
  }
}

/**
 * Get AutoRAG job details for a specific job
 * This endpoint returns the status of an AutoRAG processing job
 */
export async function handleAutoRAGJobDetails(c: ContextWithAuth) {
  try {
    const ragId = c.req.param("ragId");
    const jobId = c.req.param("jobId");
    const username = (c as any).userAuth.username;

    console.log(
      `[AutoRAG] Getting job details for RAG ID: ${ragId}, job ID: ${jobId}, user: ${username}`
    );

    // Call the Cloudflare AutoRAG job details API
    const accountId = c.env.AUTORAG_ACCOUNT_ID;
    const apiUrl = c.env.AUTORAG_API_URL;

    if (!accountId || !apiUrl) {
      throw new Error("AutoRAG configuration missing: ACCOUNT_ID or API_URL");
    }

    const jobDetailsUrl = AUTORAG_CONFIG.buildLibraryAutoRAGUrl(
      accountId,
      apiUrl,
      `/jobs/${jobId}`
    );
    console.log(`[AutoRAG] Calling job details API: ${jobDetailsUrl}`);

    const response = await fetch(jobDetailsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.env.AUTORAG_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `AutoRAG job details API failed: ${response.status} ${errorText}`
      );
    }

    const result = (await response.json()) as AutoRAGJobResponse;
    console.log(`[AutoRAG] Job details API response:`, result);

    if (!result.success || !result.result) {
      throw new Error("Invalid response from AutoRAG job details API");
    }

    console.log(
      `[AutoRAG] Job details retrieved successfully for job: ${jobId}`
    );

    return c.json({
      success: true,
      result: result.result,
    });
  } catch (error) {
    console.error("[AutoRAG] Error getting job details:", error);
    return c.json(
      {
        success: false,
        error: `Failed to get job details: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      500
    );
  }
}

/**
 * Get AutoRAG job logs for a specific job
 * This endpoint returns detailed logs from an AutoRAG processing job
 */
export async function handleAutoRAGJobLogs(c: ContextWithAuth) {
  try {
    const ragId = c.req.param("ragId");
    const jobId = c.req.param("jobId");
    const username = (c as any).userAuth.username;

    console.log(
      `[AutoRAG] Getting job logs for RAG ID: ${ragId}, job ID: ${jobId}, user: ${username}`
    );

    // Call the Cloudflare AutoRAG job logs API
    const accountId = c.env.AUTORAG_ACCOUNT_ID;
    const apiUrl = c.env.AUTORAG_API_URL;

    if (!accountId || !apiUrl) {
      throw new Error("AutoRAG configuration missing: ACCOUNT_ID or API_URL");
    }

    const jobLogsUrl = AUTORAG_CONFIG.buildLibraryAutoRAGUrl(
      accountId,
      apiUrl,
      `/jobs/${jobId}/logs`
    );
    console.log(`[AutoRAG] Calling job logs API: ${jobLogsUrl}`);

    const response = await fetch(jobLogsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.env.AUTORAG_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `AutoRAG job logs API failed: ${response.status} ${errorText}`
      );
    }

    const result = (await response.json()) as AutoRAGJobLogsResponse;
    console.log(`[AutoRAG] Job logs API response:`, result);

    console.log(`[AutoRAG] Job logs retrieved successfully for job: ${jobId}`);

    return c.json({
      success: true,
      result: {
        job_id: jobId,
        logs: result.result?.logs || [],
      },
    });
  } catch (error) {
    console.error("[AutoRAG] Error getting job logs:", error);
    return c.json(
      {
        success: false,
        error: `Failed to get job logs: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      500
    );
  }
}

/**
 * Get all AutoRAG jobs for a specific RAG resource
 * This endpoint returns a list of all jobs for a given RAG resource
 */
export async function handleAutoRAGJobs(c: ContextWithAuth) {
  try {
    const ragId = c.req.param("ragId");
    const username = (c as any).userAuth.username;

    console.log(
      `[AutoRAG] Getting jobs for RAG ID: ${ragId}, user: ${username}`
    );

    // Call the Cloudflare AutoRAG jobs API
    const accountId = c.env.AUTORAG_ACCOUNT_ID;
    const apiUrl = c.env.AUTORAG_API_URL;

    if (!accountId || !apiUrl) {
      throw new Error("AutoRAG configuration missing: ACCOUNT_ID or API_URL");
    }

    const jobsUrl = AUTORAG_CONFIG.buildLibraryAutoRAGUrl(
      accountId,
      apiUrl,
      "/jobs"
    );
    console.log(`[AutoRAG] Calling jobs API: ${jobsUrl}`);

    const response = await fetch(jobsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.env.AUTORAG_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `AutoRAG jobs API failed: ${response.status} ${errorText}`
      );
    }

    const result = (await response.json()) as AutoRAGJobsResponse;
    console.log(`[AutoRAG] Jobs API response:`, result);

    console.log(`[AutoRAG] Jobs retrieved successfully for RAG: ${ragId}`);

    return c.json({
      success: true,
      result: {
        rag_id: ragId,
        jobs: result.result?.jobs || [],
      },
    });
  } catch (error) {
    console.error("[AutoRAG] Error getting jobs:", error);
    return c.json(
      {
        success: false,
        error: `Failed to get jobs: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      500
    );
  }
}
