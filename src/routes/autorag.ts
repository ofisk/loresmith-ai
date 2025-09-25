import type { Context } from "hono";
import { FileDAO } from "../dao/file-dao";
import { notifyFileUploadComplete } from "../lib/notifications";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import { FileAnalysisOrchestrator } from "../services/file-analysis-orchestrator-service";
import { FileAnalysisService } from "../services/file-analysis-service";
import { AUTORAG_CONFIG } from "../shared-config";

const AUTORAG_ENDPOINTS = {
  SYNC: "/sync",
  JOBS: "/jobs",
  JOB_DETAILS: "/jobs/{jobId}",
  JOB_LOGS: "/jobs/{jobId}/logs",
  LOGS: "/logs",
} as const;

async function triggerAutoRAGSync(
  env: any,
  baseUrl: string
): Promise<AutoRAGSyncResponse> {
  const syncUrl = AUTORAG_CONFIG.buildLibraryAutoRAGUrl(
    baseUrl,
    AUTORAG_ENDPOINTS.SYNC
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
    const baseUrl = c.env.AUTORAG_BASE_URL;

    if (!baseUrl) {
      throw new Error("AutoRAG configuration missing: AUTORAG_BASE_URL");
    }

    // Trigger AutoRAG sync
    const result = await triggerAutoRAGSync(c.env, baseUrl);
    console.log(`[AutoRAG] Sync API response:`, result);

    if (!result.success || !result.result?.job_id) {
      throw new Error("Invalid response from AutoRAG sync API: missing job_id");
    }

    console.log(
      `[AutoRAG] Sync triggered successfully, job_id: ${result.result.job_id}`
    );

    // Store the job in the autorag_jobs table for tracking
    try {
      const fileDAO = new FileDAO(c.env.DB);

      if (filename) {
        // Specific file upload - track the job for this file
        const fileKey = `autorag/${username}/${filename}`;
        await fileDAO.createAutoRAGJob(
          result.result.job_id,
          ragId,
          username,
          fileKey,
          filename
        );
        console.log(
          `[AutoRAG] Job ${result.result.job_id} stored for file ${filename}`
        );
      } else {
        // Full sync - track the job for all processing files
        const processingFiles = await fileDAO.getFilesByStatus(
          username,
          FileDAO.STATUS.PROCESSING
        );
        console.log(
          `[AutoRAG] Full sync job ${result.result.job_id} - tracking ${processingFiles.length} processing files`
        );

        for (const file of processingFiles) {
          await fileDAO.createAutoRAGJob(
            result.result.job_id,
            ragId,
            username,
            file.file_key,
            file.file_name
          );
          console.log(
            `[AutoRAG] Job ${result.result.job_id} stored for file ${file.file_name}`
          );
        }
      }
    } catch (jobError) {
      console.error(`[AutoRAG] Failed to store job tracking:`, jobError);
      // Don't fail the sync request if job tracking fails
    }

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
    const baseUrl = c.env.AUTORAG_BASE_URL;

    if (!baseUrl) {
      throw new Error("AutoRAG configuration missing: AUTORAG_BASE_URL");
    }

    const jobDetailsUrl = AUTORAG_CONFIG.buildLibraryAutoRAGUrl(
      baseUrl,
      AUTORAG_ENDPOINTS.JOB_DETAILS.replace("{jobId}", jobId)
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
    const baseUrl = c.env.AUTORAG_BASE_URL;

    if (!baseUrl) {
      throw new Error("AutoRAG configuration missing: AUTORAG_BASE_URL");
    }

    const jobLogsUrl = AUTORAG_CONFIG.buildLibraryAutoRAGUrl(
      baseUrl,
      AUTORAG_ENDPOINTS.JOB_LOGS.replace("{jobId}", jobId)
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
    const baseUrl = c.env.AUTORAG_BASE_URL;

    if (!baseUrl) {
      throw new Error("AutoRAG configuration missing: AUTORAG_BASE_URL");
    }

    const jobsUrl = AUTORAG_CONFIG.buildLibraryAutoRAGUrl(
      baseUrl,
      AUTORAG_ENDPOINTS.JOBS
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

/**
 * Check the status of a single AutoRAG job and update file status accordingly
 */
async function checkSingleJobStatus(
  job: any,
  env: any
): Promise<{ status: string; updated: boolean }> {
  const fileDAO = new FileDAO(env.DB);

  // Call the Cloudflare AutoRAG API to check job status
  const baseUrl = env.AUTORAG_BASE_URL;

  if (!baseUrl) {
    throw new Error("AutoRAG configuration missing: AUTORAG_BASE_URL");
  }

  const jobDetailsUrl = AUTORAG_CONFIG.buildLibraryAutoRAGUrl(
    baseUrl,
    AUTORAG_ENDPOINTS.JOB_DETAILS.replace("{jobId}", job.job_id)
  );

  console.log(
    `[AutoRAG] Checking job: ${job.job_id} for file: ${job.file_name}`
  );
  console.log(`[AutoRAG] Job details URL: ${jobDetailsUrl}`);

  try {
    const jobResponse = await fetch(jobDetailsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AUTORAG_API_TOKEN}`,
      },
    });

    console.log(`[AutoRAG] Job response status: ${jobResponse.status}`);

    if (jobResponse.ok) {
      const jobResult = (await jobResponse.json()) as any;
      console.log(`[AutoRAG] Job result:`, JSON.stringify(jobResult, null, 2));

      // Extract job status from the response
      let jobStatus = jobResult.result?.status || jobResult.status;

      // If no explicit status field, determine status from other fields
      if (!jobStatus) {
        if (jobResult.result?.ended_at) {
          // Job has ended, check if it was successful
          if (jobResult.result?.end_reason === null) {
            jobStatus = "completed";
          } else {
            jobStatus = "failed";
          }
        } else if (jobResult.result?.started_at) {
          // Job has started but not ended
          jobStatus = "processing";
        } else {
          // Job hasn't started yet
          jobStatus = "pending";
        }
      }

      console.log(`[AutoRAG] Job ${job.job_id} status: ${jobStatus}`);

      // Ensure jobStatus is never undefined
      if (!jobStatus) {
        jobStatus = "unknown";
      }

      // Update job status in our database
      await fileDAO.updateAutoRAGJobStatus(job.job_id, jobStatus);

      // Map AutoRAG job status to our file status
      let fileStatus = "processing";
      let updated = false;

      if (jobStatus === "completed" || jobStatus === "success") {
        fileStatus = "completed";
        updated = true;
      } else if (jobStatus === "failed" || jobStatus === "error") {
        fileStatus = "error";
        updated = true;
      }

      // Update file status if it changed
      if (updated) {
        await fileDAO.updateFileStatusByJobId(job.job_id, fileStatus);
        console.log(
          `[AutoRAG] Updated file ${job.file_name} to status: ${fileStatus}`
        );

        // If the job completed, emit a user notification via SSE
        if (fileStatus === "completed") {
          try {
            const meta = await fileDAO.getFileMetadata(job.file_key);
            const size = meta?.file_size ?? 0;
            console.log(
              `[AutoRAG] Sending FILE_UPLOADED notification for ${job.file_name} (size=${size}) to ${job.username}`
            );
            await notifyFileUploadComplete(
              env,
              job.username,
              job.file_name,
              size
            );
          } catch (notifyError) {
            console.error(
              `[AutoRAG] Failed to send file upload notification for ${job.file_name}:`,
              notifyError
            );
          }
        }
      }

      return { status: fileStatus, updated };
    } else {
      const errorText = await jobResponse.text();
      console.error(
        `[AutoRAG] Job check failed: ${jobResponse.status} - ${errorText}`
      );

      // Mark job as failed if we can't reach the API
      await fileDAO.updateAutoRAGJobStatus(
        job.job_id,
        "error",
        `API Error: ${jobResponse.status}`
      );
      return { status: "error", updated: true };
    }
  } catch (error) {
    console.error(`[AutoRAG] Error checking job ${job.job_id}:`, error);

    // Mark job as failed on exception
    await fileDAO.updateAutoRAGJobStatus(
      job.job_id,
      "error",
      `Exception: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    return { status: "error", updated: true };
  }
}

/**
 * Refresh all file statuses for a user
 * This endpoint checks all processing files and updates their status based on AutoRAG completion
 */
export async function handleRefreshAllFileStatuses(c: ContextWithAuth) {
  try {
    const { username } = await c.req.json();

    if (!username) {
      return c.json({ error: "Username is required" }, 400);
    }

    console.log(`[AutoRAG] Refreshing all file statuses for user: ${username}`);

    const fileDAO = new FileDAO(c.env.DB);

    // Get all pending AutoRAG jobs for this user
    const pendingJobs = await fileDAO.getPendingAutoRAGJobs(username);

    console.log(
      `[AutoRAG] Found ${pendingJobs.length} pending jobs for user ${username}`
    );

    if (pendingJobs.length === 0) {
      // Check for files stuck in processing status without job tracking
      const processingFiles = await fileDAO.getFilesByStatus(
        username,
        FileDAO.STATUS.PROCESSING
      );

      if (processingFiles.length > 0) {
        console.log(
          `[AutoRAG] Found ${processingFiles.length} files stuck in processing status without job tracking`
        );

        // For files without job tracking, mark them as failed if they've been processing for more than 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        let updatedCount = 0;

        for (const file of processingFiles) {
          const fileCreatedAt = new Date(file.created_at);
          if (fileCreatedAt < fiveMinutesAgo) {
            // File has been processing for more than 5 minutes, mark as failed
            await fileDAO.updateFileStatusByKey(
              file.file_key,
              FileDAO.STATUS.ERROR
            );
            console.log(
              `[AutoRAG] Marked file ${file.file_name} as failed (stuck in processing for >5 minutes without job tracking)`
            );
            updatedCount++;
          }
        }

        if (updatedCount > 0) {
          return c.json({
            success: true,
            message: `Marked ${updatedCount} files as failed (stuck in processing status without job tracking)`,
            updatedCount,
            autoFailed: true,
          });
        }
      }

      return c.json({
        success: true,
        message: "No pending jobs need status refresh",
        updatedCount: 0,
      });
    }

    const results: Array<{
      filename: string;
      jobId: string;
      oldStatus: string;
      newStatus: string;
      message: string;
      updated: boolean;
    }> = [];

    for (const job of pendingJobs) {
      try {
        const result = await checkSingleJobStatus(job, c.env);
        results.push({
          filename: job.file_name,
          jobId: job.job_id,
          oldStatus: job.status,
          newStatus: result.status,
          message: result.updated ? "Status updated" : "Status unchanged",
          updated: result.updated,
        });
      } catch (error) {
        console.error(`[AutoRAG] Error checking job ${job.job_id}:`, error);
        results.push({
          filename: job.file_name,
          jobId: job.job_id,
          oldStatus: job.status,
          newStatus: "error",
          message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          updated: false,
        });
      }
    }

    const updatedCount = results.filter((r) => r.updated).length;

    console.log(
      `[AutoRAG] Updated ${updatedCount} out of ${pendingJobs.length} jobs for user ${username}`
    );

    return c.json({
      success: true,
      message: `Refreshed ${pendingJobs.length} jobs`,
      results,
      updatedCount,
      totalChecked: pendingJobs.length,
    });
  } catch (error) {
    console.error("[AutoRAG] Error refreshing file statuses:", error);
    return c.json(
      {
        success: false,
        error: `Failed to refresh file statuses: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      500
    );
  }
}
