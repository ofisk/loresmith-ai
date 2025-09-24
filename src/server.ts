import { routeAgentRequest, type Schedule } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import { generateId, type StreamTextOnFinishCallback, type ToolSet } from "ai";
import { Hono } from "hono";
import {
  handleIngestionHealth,
  handleIngestionStats,
  handleIngestionStatus,
} from "./api_status";
import { JWT_STORAGE_KEY } from "./constants";
import { UploadSessionDO } from "./durable-objects/upload-session";
import type { AgentType } from "./lib/agent-router";
import { AgentRouter } from "./lib/agent-router";
import { ModelManager } from "./lib/model-manager";
import { queue as queueFn, scheduled as scheduledFn } from "./queue_consumer";
import {
  handleGetAssessmentRecommendations,
  handleGetUserActivity,
  handleGetUserState,
  handleModuleIntegration,
} from "./routes/assessment";
import {
  handleAuthenticate,
  handleCheckOpenAIKey,
  handleCheckUserOpenAIKey,
  handleDeleteOpenAIKey,
  handleGetOpenAIKey,
  handleLogout,
  handleSetOpenAIApiKey,
  handleStoreOpenAIKey,
  requireUserJwt,
} from "./routes/auth";
import {
  handleAutoRAGJobDetails,
  handleAutoRAGJobLogs,
  handleAutoRAGJobs,
  handleAutoRAGSync,
  handleRefreshAllFileStatuses,
} from "./routes/autorag";
import {
  handleApproveShards,
  handleGetStagedShards,
  handleRejectShards,
} from "./routes/campaign-autorag";
import {
  handleAddResourceToCampaign,
  handleCreateCampaign,
  handleDeleteAllCampaigns,
  handleDeleteCampaign,
  handleGetCampaign,
  handleGetCampaignResources,
  handleGetCampaigns,
  handleRemoveResourceFromCampaign,
  handleUpdateCampaign,
} from "./routes/campaigns";
import {
  handleGetExternalResourceRecommendations,
  handleGetExternalResourceSearch,
  handleGetGmResources,
} from "./routes/external-resources";
import fileAnalysisRoutes from "./routes/file-analysis";
import {
  handleDeleteFile,
  handleGetFileDetails,
  handleGetFileDownload,
  handleGetStorageUsage,
  handleRegenerateFileMetadata,
  handleSearchFiles,
  handleUpdateFile,
} from "./routes/library";
import {
  handleMintStreamToken,
  handleNotificationPublish,
  handleNotificationStream,
} from "./routes/notifications";
import {
  handleGetNextActions,
  handleGetStateAnalysis,
  handleGetWelcomeGuidance,
} from "./routes/onboarding";
import { handleProgressWebSocket } from "./routes/progress";
import {
  handleDeleteFileForRag,
  handleGetFileChunksForRag,
  handleGetFilesForRag,
  handleProcessFileForRag,
  handleProcessFileFromR2ForRag,
  handleRagSearch,
  handleTriggerAutoRAGIndexing,
} from "./routes/rag";

import {
  handleAbortLargeUpload,
  handleCompleteLargeUpload,
  handleDirectUpload,
  handleGetFileStatus,
  handleGetFiles,
  handleGetUploadProgress,
  handleStartLargeUpload,
  handleUpdateFileMetadata,
  handleUploadPart,
  handleUploadStatus,
} from "./routes/upload";
import type { AuthEnv } from "./services/auth-service";
import { AuthService } from "./services/auth-service";
import { API_CONFIG } from "./shared";

interface Env extends AuthEnv {
  ADMIN_SECRET?: string;
  OPENAI_API_KEY?: string;
  R2: R2Bucket;
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: any; // AI binding for AutoRAG
  CHAT: DurableObjectNamespace;
  USER_FILE_TRACKER: DurableObjectNamespace;
  UPLOAD_SESSION: DurableObjectNamespace;
  NOTIFICATIONS: DurableObjectNamespace;
  ASSETS: Fetcher;
  FILE_PROCESSING_QUEUE: Queue;
  FILE_PROCESSING_DLQ: Queue;
  AUTORAG_API_TOKEN: string;
}

/**
 * Chat Agent implementation that routes to specialized agents based on user intent
 */
export class Chat extends AIChatAgent<Env> {
  private agents: Map<string, any> = new Map();
  private userOpenAIKey: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.agents = new Map();

    this.loadUserOpenAIKey();
  }

  /**
   * Load the user's OpenAI API key from storage
   */
  private async loadUserOpenAIKey() {
    try {
      const storedKey = await this.ctx.storage.get<string>("userOpenAIKey");
      if (storedKey) {
        console.log("Loaded user OpenAI API key from storage");
        this.userOpenAIKey = storedKey;
        await this.initializeAgents(storedKey);
      } else {
        console.log("No user API key stored - will use default OPENAI_API_KEY");
        await this.initializeAgents(null);
      }
    } catch (error) {
      console.error("Error loading user OpenAI API key:", error);
    }
  }

  private async initializeAgents(openAIAPIKey: string | null) {
    try {
      const modelManager = ModelManager.getInstance();

      if (openAIAPIKey) {
        modelManager.initializeModel(openAIAPIKey);
        console.log("[Chat] Initialized model with user OpenAI API key");
      } else {
        // Use default OPENAI_API_KEY when no user API key is provided
        if (!this.env.OPENAI_API_KEY) {
          throw new Error(
            "OPENAI_API_KEY is required for application functionality"
          );
        }
        modelManager.initializeModel(this.env.OPENAI_API_KEY);
        console.log("[Chat] Initialized model with default OPENAI_API_KEY");
      }

      const { AgentRegistryService } = await import("./lib/agent-registry");

      const registeredAgentTypes =
        await AgentRegistryService.getRegisteredAgentTypes();

      for (const agentType of registeredAgentTypes) {
        const agentClass = await AgentRegistryService.getAgentClass(
          agentType as AgentType
        );
        if (agentClass) {
          const agentInstance = new agentClass(
            this.ctx,
            this.env,
            modelManager.getModel()
          );

          // Store agent instances in the Map
          this.agents.set(agentType, agentInstance);
        }
      }

      console.log(
        `Agents initialized successfully: ${registeredAgentTypes.join(", ")}`
      );
    } catch (error) {
      console.error("Error initializing agents:", error);
      throw error;
    }
  }

  getCachedKey(): string | null {
    return this.userOpenAIKey;
  }

  /**
   * Set the user's OpenAI API key and initialize all agents with the new key.
   * This is called when a user explicitly sets their API key (e.g., via HTTP request).
   *
   * @param openAIAPIKey - The OpenAI API key to set
   */
  async setUserOpenAIKey(openAIAPIKey: string) {
    this.userOpenAIKey = openAIAPIKey;
    this.ctx.storage.put("userOpenAIKey", openAIAPIKey);

    await this.initializeAgents(openAIAPIKey);
  }

  /**
   * Handle HTTP request to set user's OpenAI API key.
   * This is the HTTP endpoint handler that validates the request and calls setUserOpenAIKey().
   *
   * @param request - The HTTP request containing the API key
   * @returns Promise<Response> - HTTP response indicating success/failure
   */
  private async handleSetUserOpenAIKeyRequest(
    request: Request
  ): Promise<Response> {
    return AuthService.handleSetUserOpenAIKey(request, this);
  }

  /**
   * Cache the user's OpenAI API key without initializing agents.
   * This is part of the OpenAIKeyCache interface and is called when loading
   * keys from the database during caching operations.
   *
   * @param key - The OpenAI API key to cache
   */
  async setCachedKey(key: string): Promise<void> {
    this.userOpenAIKey = key;
    await this.ctx.storage.put("userOpenAIKey", key);
  }

  async clearCachedKey(): Promise<void> {
    this.userOpenAIKey = null;
    await this.ctx.storage.delete("userOpenAIKey");
  }

  /**
   * Handle HTTP requests to the Chat durable object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/set-user-openai-key") {
      return this.handleSetUserOpenAIKeyRequest(request);
    }

    // Extract JWT token from Authorization header and store it for authentication
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const jwtToken = authHeader.slice(7);
      await this.ctx.storage.put(JWT_STORAGE_KEY, jwtToken);
      console.log("[Chat] Stored JWT token from Authorization header");
    }

    return super.fetch(request);
  }

  /**
   * Determines which specialized agent should handle the user's request
   * based on keywords and intent in the message and conversation context
   */
  private async determineAgent(userMessage: string): Promise<string> {
    const modelManager = ModelManager.getInstance();
    const model = modelManager.getModel();

    if (!model) {
      console.log(
        "[Chat] No model available for agent routing, using default agent"
      );
      return "campaign-context";
    }

    const intent = await AgentRouter.routeMessage(
      userMessage,
      this.messages
        .slice(-6)
        .map((msg) => msg.content)
        .join(" "),
      null,
      model
    );

    return intent.agent;
  }

  /**
   * Handles incoming chat messages and routes to appropriate specialized agent
   * @param onFinish - Callback function executed when streaming completes
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // Get the last user message first (used in multiple places)
    const lastUserMessage = this.messages
      .slice()
      .reverse()
      .find((msg) => msg.role === "user");

    // Check if agents are initialized, and try to initialize them if not
    if (this.agents.size === 0) {
      // Get JWT token from storage (set from Authorization header)
      const jwtToken = await this.ctx.storage.get<string>(JWT_STORAGE_KEY);

      if (!jwtToken) {
        console.log(
          "[Chat] No JWT token found in storage, requiring authentication"
        );
        throw new Error(
          "AUTHENTICATION_REQUIRED: OpenAI API key required. Please authenticate first."
        );
      }

      // Use AuthService to handle all authentication logic
      const username = AuthService.parseJwtForUsername(jwtToken);
      const authResult = await AuthService.handleAgentAuthentication(
        username,
        this.messages.some((msg) => msg.role === "user"),
        this.env.DB,
        this,
        jwtToken
      );

      if (!authResult.shouldProceed) {
        console.log("[Chat] Authentication failed, requiring authentication");
        throw new Error(
          "AUTHENTICATION_REQUIRED: OpenAI API key required. Please authenticate first."
        );
      }

      if (authResult.openAIAPIKey) {
        console.log("[Chat] Initializing agents with user OpenAI API key");
        await this.initializeAgents(authResult.openAIAPIKey);
      } else {
        console.log(
          "[Chat] No user OpenAI API key found, requiring authentication"
        );
        throw new Error(
          "AUTHENTICATION_REQUIRED: OpenAI API key required. Please authenticate first."
        );
      }
    }

    // If there are no user messages, this might be initial message retrieval
    if (!lastUserMessage) {
      // For initial message retrieval, return empty response if no agents
      if (this.agents.size === 0) {
        console.log(
          "[Chat] No agents initialized and no user messages, returning empty response"
        );
        return;
      }

      const targetAgentInstance = this.getAgentInstance("campaign-context");
      targetAgentInstance.messages = [...this.messages];
      return targetAgentInstance.onChatMessage(onFinish, {
        abortSignal: _options?.abortSignal,
      });
    }

    // For actual message processing, require authentication
    if (this.agents.size === 0) {
      console.log(
        "[Chat] Agents not initialized for message processing, requiring authentication"
      );
      throw new Error(
        "AUTHENTICATION_REQUIRED: OpenAI API key required. Please authenticate first."
      );
    }

    const targetAgent = await this.determineAgent(lastUserMessage.content);
    console.log(
      `[Chat] Routing to ${targetAgent} agent for message: "${lastUserMessage.content}"`
    );

    // Copy messages  to the target agent
    const targetAgentInstance = this.getAgentInstance(targetAgent);
    targetAgentInstance.messages = [...this.messages];

    return targetAgentInstance.onChatMessage(onFinish, {
      abortSignal: _options?.abortSignal,
    });
  }

  /**
   * Get the appropriate agent instance based on the target type
   */
  private getAgentInstance(targetAgent: string): any {
    // Check if agents are initialized
    if (this.agents.size === 0) {
      throw new Error(
        "Agents not initialized. Please set an OpenAI API key first."
      );
    }

    const agentInstance = this.agents.get(targetAgent);
    if (!agentInstance) {
      const firstAgent = this.agents.values().next().value;
      console.warn(`Agent '${targetAgent}' not found, using fallback agent`);
      return firstAgent;
    }

    return agentInstance;
  }

  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        content: `Running scheduled task: ${description}`,
        createdAt: new Date(),
      },
    ]);
  }
}

export { NotificationHub, UserFileTracker } from "./durable-objects";
export { UploadSessionDO };

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  // Log all incoming requests for debugging
  console.log(`[Server] ${c.req.method} ${c.req.path} - request received`);

  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*", // For dev, or use "http://localhost:5173" for stricter
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Session-ID",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  await next();
  c.header("Access-Control-Allow-Origin", "*");
  c.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Session-ID"
  );
});

app.get(API_CONFIG.ENDPOINTS.OPENAI.CHECK_KEY, handleCheckOpenAIKey);
app.get(API_CONFIG.ENDPOINTS.OPENAI.CHECK_USER_KEY, handleCheckUserOpenAIKey);
app.post(API_CONFIG.ENDPOINTS.CHAT.SET_OPENAI_KEY, handleSetOpenAIApiKey);

// Authentication and OpenAI Key Management Routes
app.post(API_CONFIG.ENDPOINTS.AUTH.AUTHENTICATE, handleAuthenticate);
app.post(API_CONFIG.ENDPOINTS.AUTH.LOGOUT, handleLogout);
app.get(API_CONFIG.ENDPOINTS.AUTH.GET_OPENAI_KEY, handleGetOpenAIKey);
app.post(API_CONFIG.ENDPOINTS.AUTH.STORE_OPENAI_KEY, handleStoreOpenAIKey);
app.delete(API_CONFIG.ENDPOINTS.AUTH.DELETE_OPENAI_KEY, handleDeleteOpenAIKey);

// RAG Routes
app.post(API_CONFIG.ENDPOINTS.RAG.SEARCH, requireUserJwt, handleRagSearch);
app.post(
  API_CONFIG.ENDPOINTS.RAG.PROCESS_FILE,
  requireUserJwt,
  handleProcessFileForRag
);
app.post(
  API_CONFIG.ENDPOINTS.RAG.PROCESS_FILE_FROM_R2,
  requireUserJwt,
  handleProcessFileFromR2ForRag
);
app.put(
  API_CONFIG.ENDPOINTS.LIBRARY.UPDATE_METADATA(":fileKey"),
  requireUserJwt,
  handleUpdateFileMetadata
);
app.get(API_CONFIG.ENDPOINTS.RAG.FILES, requireUserJwt, handleGetFilesForRag);
app.delete(
  API_CONFIG.ENDPOINTS.RAG.DELETE_FILE(":fileKey"),
  requireUserJwt,
  handleDeleteFileForRag
);
app.get(
  API_CONFIG.ENDPOINTS.RAG.FILE_CHUNKS(":fileKey"),
  requireUserJwt,
  handleGetFileChunksForRag
);
app.post(
  API_CONFIG.ENDPOINTS.RAG.TRIGGER_INDEXING,
  requireUserJwt,
  handleTriggerAutoRAGIndexing
);
app.get(API_CONFIG.ENDPOINTS.RAG.STATUS, requireUserJwt);

// AutoRAG Routes
app.patch(
  API_CONFIG.ENDPOINTS.AUTORAG.SYNC(":ragId"),
  requireUserJwt,
  handleAutoRAGSync
);
app.get(
  API_CONFIG.ENDPOINTS.AUTORAG.JOB_DETAILS(":ragId", ":jobId"),
  requireUserJwt,
  handleAutoRAGJobDetails
);
app.get(
  API_CONFIG.ENDPOINTS.AUTORAG.JOB_LOGS(":ragId", ":jobId"),
  requireUserJwt,
  handleAutoRAGJobLogs
);
app.get(
  API_CONFIG.ENDPOINTS.AUTORAG.JOBS(":ragId"),
  requireUserJwt,
  handleAutoRAGJobs
);
app.post(
  API_CONFIG.ENDPOINTS.AUTORAG.REFRESH_ALL_FILE_STATUSES,
  requireUserJwt,
  handleRefreshAllFileStatuses
);

// File Analysis Routes
app.route(API_CONFIG.ENDPOINTS.FILE_ANALYSIS.BASE, fileAnalysisRoutes);

// Campaign Routes
app.get(
  API_CONFIG.ENDPOINTS.CAMPAIGNS.LIST,
  requireUserJwt,
  handleGetCampaigns
);
app.post(
  API_CONFIG.ENDPOINTS.CAMPAIGNS.CREATE,
  requireUserJwt,
  handleCreateCampaign
);
app.get(
  API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(":campaignId"),
  requireUserJwt,
  handleGetCampaign
);
app.get(
  API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCES(":campaignId"),
  requireUserJwt,
  handleGetCampaignResources
);

app.post(
  API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE(":campaignId"),
  requireUserJwt,
  handleAddResourceToCampaign
);
app.delete(
  API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_DELETE(":campaignId", ":resourceId"),
  requireUserJwt,
  handleRemoveResourceFromCampaign
);
app.delete(
  API_CONFIG.ENDPOINTS.CAMPAIGNS.DELETE(":campaignId"),
  requireUserJwt,
  handleDeleteCampaign
);
app.put(
  API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(":campaignId"),
  requireUserJwt,
  handleUpdateCampaign
);
app.delete(
  API_CONFIG.ENDPOINTS.CAMPAIGNS.DELETE_ALL,
  requireUserJwt,
  handleDeleteAllCampaigns
);

// Campaign AutoRAG Routes
app.post(
  API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.APPROVE(":campaignId"),
  requireUserJwt,
  handleApproveShards
);
app.post(
  API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.REJECT(":campaignId"),
  requireUserJwt,
  handleRejectShards
);

// New Campaign AutoRAG Shard Management Routes
app.get(
  API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.STAGED_SHARDS(":campaignId"),
  requireUserJwt,
  handleGetStagedShards
);
app.post(
  API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.APPROVE_SHARDS(":campaignId"),
  requireUserJwt,
  handleApproveShards
);
app.post(
  API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.REJECT_SHARDS(":campaignId"),
  requireUserJwt,
  handleRejectShards
);

// Progress WebSocket
app.get(API_CONFIG.ENDPOINTS.PROGRESS.WEBSOCKET, handleProgressWebSocket);

// Assessment Routes
app.get(
  API_CONFIG.ENDPOINTS.ASSESSMENT.USER_STATE,
  requireUserJwt,
  handleGetUserState
);
app.get(
  API_CONFIG.ENDPOINTS.ASSESSMENT.CAMPAIGN_READINESS(":campaignId"),
  requireUserJwt,
  handleGetAssessmentRecommendations
);
app.get(
  API_CONFIG.ENDPOINTS.ASSESSMENT.USER_ACTIVITY,
  requireUserJwt,
  handleGetUserActivity
);
app.post(
  API_CONFIG.ENDPOINTS.ASSESSMENT.MODULE_INTEGRATION,
  requireUserJwt,
  handleModuleIntegration
);

// Onboarding Routes
app.get(
  API_CONFIG.ENDPOINTS.ONBOARDING.WELCOME_GUIDANCE,
  requireUserJwt,
  handleGetWelcomeGuidance
);
app.get(
  API_CONFIG.ENDPOINTS.ONBOARDING.NEXT_ACTIONS,
  requireUserJwt,
  handleGetNextActions
);
app.get(
  API_CONFIG.ENDPOINTS.ONBOARDING.CAMPAIGN_GUIDANCE(":campaignId"),
  requireUserJwt,
  handleGetStateAnalysis
);

// External Resources Routes
app.get(
  API_CONFIG.ENDPOINTS.EXTERNAL_RESOURCES.RECOMMENDATIONS,
  requireUserJwt,
  handleGetExternalResourceRecommendations
);
app.get(
  API_CONFIG.ENDPOINTS.EXTERNAL_RESOURCES.INSPIRATION_SOURCES,
  requireUserJwt,
  handleGetExternalResourceSearch
);
app.get(
  API_CONFIG.ENDPOINTS.EXTERNAL_RESOURCES.GM_RESOURCES,
  requireUserJwt,
  handleGetGmResources
);

// Library Routes
app.get(API_CONFIG.ENDPOINTS.LIBRARY.FILES, requireUserJwt, handleGetFiles);
app.get(API_CONFIG.ENDPOINTS.LIBRARY.SEARCH, requireUserJwt, handleSearchFiles);
app.get(
  API_CONFIG.ENDPOINTS.LIBRARY.STORAGE_USAGE,
  requireUserJwt,
  handleGetStorageUsage
);
app.get(
  API_CONFIG.ENDPOINTS.LIBRARY.FILE_DETAILS(":fileId"),
  requireUserJwt,
  handleGetFileDetails
);
app.put(
  API_CONFIG.ENDPOINTS.LIBRARY.FILE_UPDATE(":fileId"),
  requireUserJwt,
  handleUpdateFile
);
app.delete(
  API_CONFIG.ENDPOINTS.LIBRARY.FILE_DELETE(":fileId"),
  requireUserJwt,
  handleDeleteFile
);

// Notification Routes
app.post(API_CONFIG.ENDPOINTS.NOTIFICATIONS.MINT_STREAM, handleMintStreamToken);
app.get(API_CONFIG.ENDPOINTS.NOTIFICATIONS.STREAM, handleNotificationStream);
app.post(API_CONFIG.ENDPOINTS.NOTIFICATIONS.PUBLISH, handleNotificationPublish);

app.get(
  API_CONFIG.ENDPOINTS.LIBRARY.FILE_DOWNLOAD(":fileId"),
  requireUserJwt,
  handleGetFileDownload
);
app.post(
  API_CONFIG.ENDPOINTS.LIBRARY.FILE_REGENERATE(":fileId"),
  requireUserJwt,
  handleRegenerateFileMetadata
);

app.get(
  API_CONFIG.ENDPOINTS.LIBRARY.STATUS,
  requireUserJwt,
  handleGetFileStatus
);

app.put(
  API_CONFIG.ENDPOINTS.UPLOAD.DIRECT(":tenant", ":filename"),
  requireUserJwt,
  handleDirectUpload
);
app.get(
  API_CONFIG.ENDPOINTS.UPLOAD.STATUS(":tenant", ":filename"),
  requireUserJwt,
  handleUploadStatus
);

// Large file upload routes
app.post(
  API_CONFIG.ENDPOINTS.UPLOAD.START_LARGE,
  requireUserJwt,
  handleStartLargeUpload
);
app.post(
  API_CONFIG.ENDPOINTS.UPLOAD.UPLOAD_PART(":sessionId", ":partNumber"),
  requireUserJwt,
  handleUploadPart
);
app.post(
  API_CONFIG.ENDPOINTS.UPLOAD.COMPLETE_LARGE(":sessionId"),
  requireUserJwt,
  handleCompleteLargeUpload
);
app.get(
  API_CONFIG.ENDPOINTS.UPLOAD.PROGRESS(":sessionId"),
  requireUserJwt,
  handleGetUploadProgress
);
app.delete(
  API_CONFIG.ENDPOINTS.UPLOAD.ABORT_LARGE(":sessionId"),
  requireUserJwt,
  handleAbortLargeUpload
);

// Ingestion status routes
app.get(
  API_CONFIG.ENDPOINTS.INGESTION.STATUS,
  requireUserJwt,
  handleIngestionStatus
);
app.get(
  API_CONFIG.ENDPOINTS.INGESTION.HEALTH,
  requireUserJwt,
  handleIngestionHealth
);
app.get(
  API_CONFIG.ENDPOINTS.INGESTION.STATS,
  requireUserJwt,
  handleIngestionStats
);

// Wrap Hono fetch in a plain function to satisfy Wrangler's export check
export const fetch = (request: Request, env: Env, ctx: ExecutionContext) =>
  app.fetch(request, env, ctx);
export const queue = (
  batch: MessageBatch<unknown>,
  env: Env,
  _ctx?: ExecutionContext
) => queueFn(batch as any, env as any);
export const scheduled = (
  event: ScheduledEvent,
  env: Env,
  _ctx?: ExecutionContext
) => scheduledFn(event as any, env as any);

export default {
  fetch,
  queue,
  scheduled,
};

// Root path handler - serve index.html
app.get("/", async (c) => {
  return c.env.ASSETS.fetch(new Request("https://example.com/index.html"));
});

// Static asset handler - serve CSS, JS, images, etc.
app.get("/assets/*", async (c) => {
  try {
    const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
    if (assetResponse.status === 200) {
      return assetResponse;
    }
  } catch (_error) {
    console.log("Asset not found:", c.req.path);
  }
  return new Response("Asset not found", { status: 404 });
});

// Favicon handler
app.get("/favicon.ico", async (c) => {
  try {
    const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
    if (assetResponse.status === 200) {
      return assetResponse;
    }
  } catch (_error) {
    console.log("Favicon not found");
  }
  return new Response("Favicon not found", { status: 404 });
});

// Agent routing handler - handle chat requests
app.get("/agents/*", async (c) => {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
    );
  }

  // Try to extract authentication from the request for agent routing
  const authHeader = c.req.header("Authorization");
  const authPayload = await AuthService.extractAuthFromHeader(
    authHeader,
    c.env
  );

  // Create a modified request with auth context if available
  const modifiedRequest = AuthService.createRequestWithAuthContext(
    c.req.raw,
    authPayload
  );

  return (
    (await routeAgentRequest(modifiedRequest, c.env as any, { cors: true })) ||
    new Response("Agent route not found", { status: 404 })
  );
});

// Catch-all for any other GET requests - return 404
app.get("*", async (_c) => {
  return new Response("Route not found", { status: 404 });
});
