/**
 * AutoRAG Job Status Service
 * Extracted from autorag.ts to reduce complexity and improve maintainability
 */

import { FileDAO } from "@/dao/file-dao";
import { logger } from "@/lib/logger";
import {
  notifyFileStatusUpdated,
  notifyFileUpdated,
  notifyFileUploadCompleteWithData,
} from "@/lib/notifications";
import type { Env } from "@/middleware/auth";
import { SyncQueueService } from "./sync-queue-service";
import { AUTORAG_CONFIG } from "@/shared-config";

const log = logger.scope("[JobStatusService]");

const AUTORAG_ENDPOINTS = {
  JOB_DETAILS: "/jobs/{jobId}",
} as const;

interface Job {
  job_id: string;
  file_name: string;
  file_key: string;
  username: string;
  status: string;
  created_at?: string;
}

interface JobStatusResult {
  status: string;
  updated: boolean;
}

/**
 * Check the status of a single AutoRAG job and update file status accordingly
 */
export async function checkSingleJobStatus(
  job: Job,
  env: Env
): Promise<JobStatusResult> {
  const startTime = Date.now();
  const fileDAO = new FileDAO(env.DB);

  log.debug("Checking job status", {
    jobId: job.job_id,
    fileName: job.file_name,
    currentStatus: job.status,
  });

  const baseUrl = env.AUTORAG_BASE_URL;
  if (!baseUrl) {
    throw new Error("AutoRAG configuration missing: AUTORAG_BASE_URL");
  }

  const jobDetailsUrl = AUTORAG_CONFIG.buildLibraryAutoRAGUrl(
    baseUrl,
    AUTORAG_ENDPOINTS.JOB_DETAILS.replace("{jobId}", job.job_id)
  );

  log.debug("Fetching job details", {
    url: jobDetailsUrl,
    tokenPresent: !!env.AUTORAG_API_TOKEN,
  });

  try {
    const jobResponse = await fetch(jobDetailsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AUTORAG_API_TOKEN}`,
      },
    });

    if (!jobResponse.ok) {
      return await handleJobStatusError(job, fileDAO, jobResponse);
    }

    const jobResult = (await jobResponse.json()) as any;
    const jobStatus = determineJobStatus(jobResult);
    log.debug("Job status determined", { jobStatus });

    const result = await updateJobAndFileStatus(job, jobStatus, fileDAO, env);

    const duration = Date.now() - startTime;
    log.debug("Job status check completed", {
      duration: `${duration}ms`,
      status: result.status,
      updated: result.updated,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error("Error checking job status", error, {
      jobId: job.job_id,
      fileName: job.file_name,
      duration: `${duration}ms`,
    });
    throw error;
  }
}

/**
 * Determine job status from API response
 */
function determineJobStatus(jobResult: any): string {
  let jobStatus = jobResult.result?.status || jobResult.status;

  // If no explicit status, determine from other fields
  if (!jobStatus) {
    if (jobResult.result?.ended_at) {
      jobStatus =
        jobResult.result?.end_reason === null ? "completed" : "failed";
    } else if (jobResult.result?.started_at) {
      jobStatus = "processing";
    } else {
      jobStatus = "pending";
    }
  }

  // Ensure jobStatus is never undefined
  return jobStatus || "unknown";
}

/**
 * Update job and file status based on job status
 */
async function updateJobAndFileStatus(
  job: Job,
  jobStatus: string,
  fileDAO: FileDAO,
  env: Env
): Promise<JobStatusResult> {
  let fileStatus = "processing";
  let updated = false;

  // Map AutoRAG job status to our file status
  if (jobStatus === "completed" || jobStatus === "success") {
    await fileDAO.updateAutoRAGJobStatus(job.job_id, "completed");
    fileStatus = FileDAO.STATUS.COMPLETED;
    updated = true;
    log.debug("Job completed", { fileName: job.file_name });
  } else if (jobStatus === "failed" || jobStatus === "error") {
    await fileDAO.updateAutoRAGJobStatus(job.job_id, "failed");
    fileStatus = FileDAO.STATUS.ERROR;
    updated = true;
    log.debug("Job failed", { fileName: job.file_name });
  } else if (jobStatus === "processing") {
    await fileDAO.updateAutoRAGJobStatus(job.job_id, "processing");
    fileStatus = FileDAO.STATUS.PROCESSING;
    updated = true;
    log.debug("Job processing", { fileName: job.file_name });
  }

  // Update file status if it changed
  if (updated) {
    await fileDAO.updateFileStatusByJobId(job.job_id, fileStatus);
    log.debug("File status updated", {
      fileName: job.file_name,
      status: fileStatus,
    });

    // Send notifications
    await sendStatusUpdateNotifications(job, fileStatus, fileDAO, env);

    // Process sync queue if job completed
    if (fileStatus === FileDAO.STATUS.COMPLETED) {
      await processSyncQueueOnCompletion(job, env);
    }
  }

  return { status: fileStatus, updated };
}

/**
 * Send status update notifications
 */
async function sendStatusUpdateNotifications(
  job: Job,
  fileStatus: string,
  fileDAO: FileDAO,
  env: Env
): Promise<void> {
  try {
    const fileRecord = await fileDAO.getFileForRag(job.file_key, job.username);

    if (fileRecord) {
      await notifyFileUpdated(env, job.username, fileRecord);
    } else {
      // Fallback to basic notification
      await notifyFileStatusUpdated(
        env,
        job.username,
        job.file_key,
        job.file_name,
        fileStatus
      );
    }
  } catch (error) {
    log.error("Failed to send status update notification", error);
  }
}

/**
 * Process sync queue when job completes
 */
async function processSyncQueueOnCompletion(job: Job, env: Env): Promise<void> {
  try {
    // Send file upload complete notification
    const fileDAO = new FileDAO(env.DB);
    const fileRecord = await fileDAO.getFileForRag(job.file_key, job.username);

    if (fileRecord) {
      await notifyFileUploadCompleteWithData(env, job.username, fileRecord);
    } else {
      log.warn("File record not found for upload completion notification", {
        fileKey: job.file_key,
      });
    }

    // Process sync queue for this user
    const queueResult = await SyncQueueService.processSyncQueue(
      env,
      job.username
    );

    if (queueResult.processed > 0) {
      log.debug("Processed sync queue", {
        processed: queueResult.processed,
        username: job.username,
        newJobId: queueResult.jobId,
      });
    }
  } catch (error) {
    log.error("Failed to process sync queue on completion", error);
  }
}

/**
 * Handle job status API error
 */
async function handleJobStatusError(
  job: Job,
  fileDAO: FileDAO,
  jobResponse: Response
): Promise<JobStatusResult> {
  const errorText = await jobResponse.text();
  log.error("Job status API error", undefined, {
    status: jobResponse.status,
    errorText,
    jobId: job.job_id,
  });

  // Mark job as failed if we can't reach the API
  await fileDAO.updateAutoRAGJobStatus(
    job.job_id,
    "error",
    `API Error: ${jobResponse.status}`
  );

  return { status: "error", updated: true };
}
