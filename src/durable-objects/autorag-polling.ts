import { DurableObject } from "cloudflare:workers";
import { checkSingleJobStatus } from "../routes/autorag";
import { FileDAO } from "../dao/file-dao";
import { SyncQueueService } from "../services/sync-queue-service";

export interface AutoRAGPollingState {
  isPolling: boolean;
  currentJobId: string | null;
  pollingInterval: ReturnType<typeof setInterval> | null;
  pollingTimeout: ReturnType<typeof setTimeout> | null;
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

    // Start polling every 10 seconds
    this.state.pollingInterval = setInterval(() => {
      this.pollJobStatus(jobId);
    }, 10000);

    // Add timeout to stop polling after 30 minutes to prevent infinite loops
    this.state.pollingTimeout = setTimeout(
      () => {
        console.log(
          `[AutoRAGPollingDO] Polling timeout reached for job: ${jobId}, stopping`
        );
        this.handleStopPolling(new Request("http://localhost/stop-polling"));
      },
      30 * 60 * 1000
    ); // 30 minutes

    // Store state
    await this.ctx.storage.put("state", this.state);

    console.log(
      `[AutoRAGPollingDO] Started polling for job: ${jobId}, user: ${username}`
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

    this.state.isPolling = false;
    const completedJobId = this.state.currentJobId;
    this.state.currentJobId = null;

    // Store state
    await this.ctx.storage.put("state", this.state);

    console.log(
      `[AutoRAGPollingDO] Stopped polling for job: ${completedJobId}`
    );

    return new Response(JSON.stringify({ success: true, completedJobId }), {
      headers: { "Content-Type": "application/json" },
    });
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
    try {
      console.log(`[AutoRAGPollingDO] Polling job status: ${jobId}`);

      // Get the job from database
      const fileDAO = new FileDAO((this.env as any).DB);
      const job = await fileDAO.getAutoRAGJob(jobId);

      if (!job) {
        console.log(
          `[AutoRAGPollingDO] Job ${jobId} not found, stopping polling`
        );
        await this.handleStopPolling(
          new Request("http://localhost/stop-polling")
        );
        return;
      }

      // Check job status with AutoRAG API
      const result = await checkSingleJobStatus(job, this.env);

      if (result.updated) {
        console.log(
          `[AutoRAGPollingDO] Job ${jobId} status updated to: ${result.status}`
        );

        if (result.status === "completed" || result.status === "failed") {
          console.log(
            `[AutoRAGPollingDO] Job ${jobId} finished, stopping polling`
          );
          await this.handleStopPolling(
            new Request("http://localhost/stop-polling")
          );

          // Process the sync queue for this user
          await this.processSyncQueue();
        }
      }
    } catch (error) {
      console.error(`[AutoRAGPollingDO] Error polling job ${jobId}:`, error);
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
