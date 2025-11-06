import { DurableObject } from "cloudflare:workers";
import { checkSingleJobStatus } from "@/services/file/job-status-service";
import { FileDAO } from "@/dao/file-dao";
import { SyncQueueService } from "@/services/file/sync-queue-service";
import type { Env } from "@/middleware/auth";

export interface AutoRAGPollingState {
  isPolling: boolean;
  currentJobId: string | null;
  pollingInterval: ReturnType<typeof setInterval> | null;
  pollingTimeout: ReturnType<typeof setTimeout> | null;
  healthCheckTimeout: ReturnType<typeof setTimeout> | null;
  consecutiveErrors: number;
  lastPolledAt: number | null;
  queue: Array<{
    fileKey: string;
    fileName: string;
    ragId: string;
  }>;
  username: string;
}

export class AutoRAGPollingDO extends DurableObject {
  private state: AutoRAGPollingState = {
    isPolling: false,
    currentJobId: null,
    pollingInterval: null,
    pollingTimeout: null,
    healthCheckTimeout: null,
    consecutiveErrors: 0,
    lastPolledAt: null,
    queue: [],
    username: "",
  };

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.split("/").pop();

    try {
      switch (action) {
        case "start-polling":
          return this.handleStartPolling(request);
        case "stop-polling":
          return this.handleStopPolling(request);
        case "queue-sync":
          return this.handleQueueSync(request);
        case "status":
          return this.handleGetStatus(request);
        case "process-queue":
          return this.handleProcessQueue(request);
        default:
          return new Response("Not found", { status: 404 });
      }
    } catch (error) {
      console.error("[AutoRAGPollingDO] Error:", error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  private async handleStartPolling(request: Request): Promise<Response> {
    const { jobId, username } = (await request.json()) as {
      jobId: string;
      username: string;
    };

    if (this.state.isPolling) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Already polling another job",
          currentJobId: this.state.currentJobId,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    this.state.isPolling = true;
    this.state.currentJobId = jobId;
    this.state.username = username;

    // Start polling every 10 seconds (consistent with actual implementation)
    const POLLING_INTERVAL = 10000; // 10 seconds
    this.state.pollingInterval = setInterval(() => {
      this.pollJobStatus(jobId);
    }, POLLING_INTERVAL);

    // Add timeout to stop polling after 30 minutes to prevent infinite loops
    const POLLING_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    this.state.pollingTimeout = setTimeout(() => {
      console.log(
        `[AutoRAGPollingDO] Polling timeout reached for job: ${jobId}, stopping`
      );
      this.handleStopPolling(new Request("http://localhost/stop-polling"));
    }, POLLING_TIMEOUT);

    // Add health check timeout to detect stuck polling
    const HEALTH_CHECK_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    this.state.healthCheckTimeout = setTimeout(() => {
      this.checkPollingHealth(jobId);
    }, HEALTH_CHECK_TIMEOUT);

    // Store state
    await this.ctx.storage.put("state", this.state);

    console.log(`[DEBUG] [AutoRAGPollingDO] ===== STARTED POLLING =====`);
    console.log(`[DEBUG] [AutoRAGPollingDO] Job ID: ${jobId}`);
    console.log(`[DEBUG] [AutoRAGPollingDO] User: ${username}`);
    console.log(
      `[DEBUG] [AutoRAGPollingDO] Polling interval: ${POLLING_INTERVAL}ms`
    );
    console.log(`[DEBUG] [AutoRAGPollingDO] Timeout: ${POLLING_TIMEOUT}ms`);
    console.log(
      `[DEBUG] [AutoRAGPollingDO] Health check: ${HEALTH_CHECK_TIMEOUT}ms`
    );
    console.log(
      `[DEBUG] [AutoRAGPollingDO] Timestamp: ${new Date().toISOString()}`
    );

    return new Response(JSON.stringify({ success: true, jobId }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleStopPolling(_request: Request): Promise<Response> {
    if (this.state.pollingInterval) {
      clearInterval(this.state.pollingInterval);
      this.state.pollingInterval = null;
    }

    if (this.state.pollingTimeout) {
      clearTimeout(this.state.pollingTimeout);
      this.state.pollingTimeout = null;
    }

    if (this.state.healthCheckTimeout) {
      clearTimeout(this.state.healthCheckTimeout);
      this.state.healthCheckTimeout = null;
    }

    this.state.isPolling = false;
    const completedJobId = this.state.currentJobId;
    this.state.currentJobId = null;
    this.state.consecutiveErrors = 0;
    this.state.lastPolledAt = null;

    // Store state
    await this.ctx.storage.put("state", this.state);

    console.log(
      `[AutoRAGPollingDO] Stopped polling for job: ${completedJobId}`
    );

    return new Response(JSON.stringify({ success: true, completedJobId }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private async checkPollingHealth(jobId: string): Promise<void> {
    try {
      const now = Date.now();
      const lastPolled = this.state.lastPolledAt || 0;
      const timeSinceLastPoll = now - lastPolled;

      console.log(`[AutoRAGPollingDO] Health check for job ${jobId}:`, {
        lastPolled: new Date(lastPolled).toISOString(),
        timeSinceLastPoll: `${timeSinceLastPoll}ms`,
        isPolling: this.state.isPolling,
        consecutiveErrors: this.state.consecutiveErrors,
      });

      // If no polling activity for 5+ minutes, consider it stuck
      if (timeSinceLastPoll > 5 * 60 * 1000) {
        console.error(
          `[AutoRAGPollingDO] Polling appears stuck for job ${jobId} - no activity for ${timeSinceLastPoll}ms`
        );

        // Mark job as failed and stop polling
        try {
          const fileDAO = new FileDAO((this.env as any).DB);
          await fileDAO.updateAutoRAGJobStatus(
            jobId,
            "error",
            `Polling stuck - no activity for ${Math.round(timeSinceLastPoll / 1000)}s`
          );
        } catch (dbError) {
          console.error(
            `[AutoRAGPollingDO] Failed to update stuck job status:`,
            dbError
          );
        }

        await this.handleStopPolling(
          new Request("http://localhost/stop-polling")
        );
        return;
      }

      // Schedule next health check
      this.state.healthCheckTimeout = setTimeout(
        () => {
          this.checkPollingHealth(jobId);
        },
        5 * 60 * 1000 // Check again in 5 minutes
      );
      await this.ctx.storage.put("state", this.state);
    } catch (error) {
      console.error(`[AutoRAGPollingDO] Health check failed:`, error);
    }
  }

  private async handleQueueSync(request: Request): Promise<Response> {
    const { fileKey, fileName, ragId } = (await request.json()) as {
      fileKey: string;
      fileName: string;
      ragId: string;
      username: string;
    };

    if (this.state.isPolling) {
      // Queue the request
      this.state.queue.push({ fileKey, fileName, ragId });
      await this.ctx.storage.put("state", this.state);

      console.log(`[AutoRAGPollingDO] Queued sync for: ${fileName}`);

      return new Response(
        JSON.stringify({
          success: true,
          queued: true,
          queuePosition: this.state.queue.length,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } else {
      // Start immediately
      return new Response(JSON.stringify({ success: true, queued: false }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  private async handleGetStatus(_request: Request): Promise<Response> {
    return new Response(
      JSON.stringify({
        isPolling: this.state.isPolling,
        currentJobId: this.state.currentJobId,
        queueLength: this.state.queue.length,
        username: this.state.username,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  private async handleProcessQueue(_request: Request): Promise<Response> {
    if (this.state.queue.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Process the first item in the queue
    const nextItem = this.state.queue.shift();
    if (!nextItem) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Store updated state
    await this.ctx.storage.put("state", this.state);

    console.log(
      `[AutoRAGPollingDO] Processing queued item: ${nextItem.fileName}`
    );

    // Return the item to be processed by the caller
    return new Response(
      JSON.stringify({
        success: true,
        processed: 1,
        item: nextItem,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  private async pollJobStatus(jobId: string): Promise<void> {
    const startTime = Date.now();
    try {
      console.log(`[DEBUG] [AutoRAGPollingDO] ===== POLLING JOB STATUS =====`);
      console.log(`[DEBUG] [AutoRAGPollingDO] Job ID: ${jobId}`);
      console.log(
        `[DEBUG] [AutoRAGPollingDO] Timestamp: ${new Date().toISOString()}`
      );

      // Update last polled timestamp for health monitoring
      this.state.lastPolledAt = Date.now();
      await this.ctx.storage.put("state", this.state);

      // Get the job from database
      console.log(`[DEBUG] [AutoRAGPollingDO] Fetching job from database...`);
      const fileDAO = new FileDAO((this.env as any).DB);
      const job = await fileDAO.getAutoRAGJob(jobId);

      if (!job) {
        console.log(
          `[DEBUG] [AutoRAGPollingDO] Job ${jobId} not found in database, stopping polling`
        );
        console.log(`[DEBUG] [AutoRAGPollingDO] Job details:`, {
          jobId,
          found: false,
          timestamp: new Date().toISOString(),
        });
        await this.handleStopPolling(
          new Request("http://localhost/stop-polling")
        );
        return;
      }

      // Check if job is already completed/failed (defensive check)
      if (
        job.status === "completed" ||
        job.status === "failed" ||
        job.status === "error"
      ) {
        console.log(
          `[DEBUG] [AutoRAGPollingDO] Job ${jobId} already finished with status: ${job.status}, stopping polling`
        );
        await this.handleStopPolling(
          new Request("http://localhost/stop-polling")
        );
        return;
      }

      console.log(`[DEBUG] [AutoRAGPollingDO] Job found:`, {
        jobId: job.job_id,
        ragId: job.rag_id,
        username: job.username,
        fileKey: job.file_key,
        fileName: job.file_name,
        status: job.status,
        created_at: job.created_at,
        updated_at: job.updated_at,
        timestamp: new Date().toISOString(),
      });

      // Check job status with AutoRAG API
      console.log(
        `[DEBUG] [AutoRAGPollingDO] Checking job status with AutoRAG API...`
      );
      const result = await checkSingleJobStatus(job, this.env as Env);
      console.log(`[DEBUG] [AutoRAGPollingDO] AutoRAG API result:`, result);

      if (result.updated) {
        console.log(
          `[DEBUG] [AutoRAGPollingDO] Job ${jobId} status updated to: ${result.status}`
        );

        // Reset error count on successful update
        this.state.consecutiveErrors = 0;
        await this.ctx.storage.put("state", this.state);

        if (result.status === "completed" || result.status === "failed") {
          console.log(
            `[DEBUG] [AutoRAGPollingDO] Job ${jobId} finished with status: ${result.status}, stopping polling`
          );
          await this.handleStopPolling(
            new Request("http://localhost/stop-polling")
          );

          // Verify the file is actually indexed after sync completion
          if (result.status === "completed") {
            console.log(
              `[DEBUG] [AutoRAGPollingDO] Verifying file is indexed...`
            );
            try {
              const { getLibraryAutoRAGService } = await import(
                "../lib/service-factory"
              );
              const libraryAutoRAG = getLibraryAutoRAGService(
                this.env as any,
                job.username
              );
              const testSearch = await libraryAutoRAG.aiSearch("test", {
                max_results: 1,
                filters: { type: "eq", key: "path", value: job.file_key },
              });
              if (!testSearch.data || testSearch.data.length === 0) {
                console.warn(
                  `[AutoRAGPollingDO] File ${job.file_name} completed sync but is not searchable yet`
                );
              } else {
                console.log(
                  `[AutoRAGPollingDO] File ${job.file_name} is successfully indexed and searchable`
                );
              }
            } catch (verifyError) {
              console.warn(
                `[AutoRAGPollingDO] Failed to verify file indexing:`,
                verifyError
              );
            }
          }

          // Process the sync queue for this user
          console.log(
            `[DEBUG] [AutoRAGPollingDO] Processing sync queue for user: ${job.username}`
          );
          await this.processSyncQueue();
        }
      } else {
        console.log(
          `[DEBUG] [AutoRAGPollingDO] Job ${jobId} status unchanged, continuing polling`
        );

        // Reset error count on successful polling (even if no update)
        this.state.consecutiveErrors = 0;
        await this.ctx.storage.put("state", this.state);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;
      console.log(`[DEBUG] [AutoRAGPollingDO] ===== POLLING COMPLETED =====`);
      console.log(`[DEBUG] [AutoRAGPollingDO] Duration: ${duration}ms`);
      console.log(
        `[DEBUG] [AutoRAGPollingDO] Status: ${result.updated ? "UPDATED" : "NO_CHANGE"}`
      );
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      console.error(`[DEBUG] [AutoRAGPollingDO] ===== POLLING FAILED =====`);
      console.error(`[DEBUG] [AutoRAGPollingDO] Duration: ${duration}ms`);
      console.error(`[DEBUG] [AutoRAGPollingDO] Job ID: ${jobId}`);
      console.error(`[DEBUG] [AutoRAGPollingDO] Error:`, error);
      console.error(
        `[DEBUG] [AutoRAGPollingDO] Error message:`,
        error instanceof Error ? error.message : String(error)
      );
      console.error(
        `[DEBUG] [AutoRAGPollingDO] Error stack:`,
        error instanceof Error ? error.stack : "No stack trace"
      );
      console.error(`[DEBUG] [AutoRAGPollingDO] Context:`, {
        jobId,
        username: this.state.username,
        isPolling: this.state.isPolling,
        currentJobId: this.state.currentJobId,
        queueLength: this.state.queue.length,
        timestamp: new Date().toISOString(),
      });

      // Increment error count and stop polling after too many consecutive errors
      this.state.consecutiveErrors = (this.state.consecutiveErrors || 0) + 1;
      await this.ctx.storage.put("state", this.state);

      console.error(
        `[AutoRAGPollingDO] Consecutive errors: ${this.state.consecutiveErrors}`
      );

      // Stop polling after 5 consecutive errors to prevent infinite failure loops
      if (this.state.consecutiveErrors >= 5) {
        console.error(
          `[AutoRAGPollingDO] Too many consecutive errors (${this.state.consecutiveErrors}), stopping polling and marking job as failed`
        );

        // Mark job as failed in database
        try {
          const fileDAO = new FileDAO((this.env as any).DB);
          await fileDAO.updateAutoRAGJobStatus(
            jobId,
            "error",
            `Polling failed after ${this.state.consecutiveErrors} consecutive errors: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        } catch (dbError) {
          console.error(
            `[AutoRAGPollingDO] Failed to update job status:`,
            dbError
          );
        }

        await this.handleStopPolling(
          new Request("http://localhost/stop-polling")
        );
      }
    }
  }

  private async processSyncQueue(): Promise<void> {
    try {
      if (this.state.queue.length === 0) {
        console.log(
          `[AutoRAGPollingDO] No queued items for user: ${this.state.username}`
        );
        return;
      }

      console.log(
        `[AutoRAGPollingDO] Processing ${this.state.queue.length} queued items for user: ${this.state.username}`
      );

      // Process the queue
      const result = await SyncQueueService.processSyncQueue(
        this.env,
        this.state.username
      );

      if (result.processed > 0) {
        console.log(
          `[AutoRAGPollingDO] Processed ${result.processed} queued items, new job: ${result.jobId}`
        );

        // If a new job was created, start polling it
        if (result.jobId) {
          await this.handleStartPolling(
            new Request("http://localhost/start-polling", {
              method: "POST",
              body: JSON.stringify({
                jobId: result.jobId!,
                username: this.state.username,
              }),
            })
          );
        }
      }
    } catch (error) {
      console.error(`[AutoRAGPollingDO] Error processing sync queue:`, error);
    }
  }

  // Initialize state from storage when DO is created
  async initializeState(): Promise<void> {
    const storedState = await this.ctx.storage.get("state");
    if (storedState) {
      this.state = { ...this.state, ...storedState };
    }
  }
}
