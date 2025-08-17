import { routeAgentRequest, type Schedule } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import { generateId, type StreamTextOnFinishCallback, type ToolSet } from "ai";
import { Hono } from "hono";
import { UploadSessionDO } from "./durable-objects/upload-session";
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
  handleCreateCampaign,
  handleDeleteAllCampaigns,
  handleDeleteCampaign,
  handleGetCampaign,
  handleGetCampaignResources,
  handleGetCampaigns,
  handleAddResourceToCampaign,
  handleRemoveResourceFromCampaign,
} from "./routes/campaigns";
import {
  handleGetExternalResourceRecommendations,
  handleGetExternalResourceSearch,
  handleGetGmResources,
} from "./routes/external-resources";
import {
  handleGetFiles,
  handleSearchFiles,
  handleGetStorageUsage,
  handleGetFileDetails,
  handleUpdateFile,
  handleDeleteFile,
  handleGetFileDownload,
  handleRegenerateFileMetadata,
} from "./routes/library";
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
  handleUpdateFileMetadataForRag,
} from "./routes/rag";
import { upload } from "./routes/upload";
import type { AgentType } from "./services/agent-router";
import type { AuthEnv } from "./services/auth-service";
import { AuthService } from "./services/auth-service";
import { ModelManager } from "./services/model-manager";
import { completeProgress } from "./services/progress";
import { getDAOFactory } from "./dao/dao-factory";
import { API_CONFIG } from "./shared";
import {
  handleAutoGenerateFileMetadata,
  handleCompleteUpload,
  handleGenerateUploadUrl,
  handleGetFileStats,
  handleGetFileStatus,
  handleProcessFile,
  handleProcessMetadataBackground,
  handleUpdateFileMetadata,
  handleUploadPart,
} from "./routes/file-management";
interface Env extends AuthEnv {
  ADMIN_SECRET?: string;
  OPENAI_API_KEY?: string;
  FILE_BUCKET: R2Bucket;
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: any; // AI binding for AutoRAG
  Chat: DurableObjectNamespace;
  UserFileTracker: DurableObjectNamespace;
  UploadSession: DurableObjectNamespace;
  ASSETS: Fetcher;
  FILE_PROCESSING_QUEUE: Queue;
  FILE_PROCESSING_DLQ: Queue;
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
      }
    } catch (error) {
      console.error("Error loading user OpenAI API key:", error);
    }
  }

  private async initializeAgents(apiKey: string) {
    try {
      const modelManager = ModelManager.getInstance();
      modelManager.initializeModel(apiKey);

      const { AgentRegistryService } = await import(
        "./services/agent-registry"
      );

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
        `Agents initialized successfully with user API key: ${registeredAgentTypes.join(", ")}`
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
   * @param apiKey - The OpenAI API key to set
   */
  async setUserOpenAIKey(apiKey: string) {
    this.userOpenAIKey = apiKey;
    this.ctx.storage.put("userOpenAIKey", apiKey);

    await this.initializeAgents(apiKey);
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

    const { AgentRouter } = await import("./services/agent-router");

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
    // Check if agents are initialized, and try to initialize them if not
    if (this.agents.size === 0) {
      // Try to get username from auth header first (for initial message retrieval)
      let username: string | null = null;

      // Check if we have auth info in the request headers
      if (this.ctx.storage) {
        try {
          const authInfo = await this.ctx.storage.get<string>("auth-info");
          if (authInfo) {
            const authPayload = JSON.parse(authInfo);
            username = authPayload.username;
            console.log("[Chat] Found username from auth info:", username);
          }
        } catch (error) {
          console.log("[Chat] Error reading auth info from storage:", error);
        }
      }

      // Fallback to extracting from messages
      if (!username) {
        const lastUserMessage = this.messages
          .slice()
          .reverse()
          .find((msg) => msg.role === "user");

        console.log(
          "[Chat] Last user message:",
          lastUserMessage ? "found" : "not found"
        );

        username = lastUserMessage
          ? AuthService.extractUsernameFromMessage(lastUserMessage)
          : null;

        console.log("[Chat] Extracted username from message:", username);
      }

      // Use the auth service helper to handle authentication logic
      const authResult = await AuthService.handleAgentAuthentication(
        username,
        this.messages.some((msg) => msg.role === "user"),
        this.env.DB,
        this
      );

      if (!authResult.shouldProceed) {
        if (authResult.requiresAuth) {
          throw new Error(
            "AUTHENTICATION_REQUIRED: OpenAI API key required. Please authenticate first."
          );
        }
        return;
      }

      if (authResult.apiKey) {
        await this.initializeAgents(authResult.apiKey);
      }
    }

    const lastUserMessage = this.messages
      .slice()
      .reverse()
      .find((msg) => msg.role === "user");

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

export { UserFileTracker } from "./durable-objects/UserFileTracker";
export { UploadSessionDO };

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*", // For dev, or use "http://localhost:5173" for stricter
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Session-ID",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  await next();
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
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

// Upload Routes
app.route("/upload", upload);

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
  API_CONFIG.ENDPOINTS.RAG.UPDATE_METADATA(":fileKey"),
  requireUserJwt,
  handleUpdateFileMetadataForRag
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
app.delete(
  API_CONFIG.ENDPOINTS.CAMPAIGNS.DELETE_ALL,
  requireUserJwt,
  handleDeleteAllCampaigns
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
  API_CONFIG.ENDPOINTS.ASSESSMENT.CAMPAIGN_HEALTH(":campaignId"),
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

// File management routes
app.post(
  API_CONFIG.ENDPOINTS.LIBRARY.UPLOAD_URL,
  requireUserJwt,
  handleGenerateUploadUrl
);
app.post(
  API_CONFIG.ENDPOINTS.LIBRARY.UPLOAD_COMPLETE,
  requireUserJwt,
  handleCompleteUpload
);
app.post(
  API_CONFIG.ENDPOINTS.LIBRARY.UPLOAD_PART,
  requireUserJwt,
  handleUploadPart
);
app.post(
  API_CONFIG.ENDPOINTS.LIBRARY.PROCESS,
  requireUserJwt,
  handleProcessFile
);
app.get(
  API_CONFIG.ENDPOINTS.LIBRARY.STATUS,
  requireUserJwt,
  handleGetFileStatus
);
app.post(
  API_CONFIG.ENDPOINTS.LIBRARY.UPDATE_METADATA,
  requireUserJwt,
  handleUpdateFileMetadata
);
app.post(
  API_CONFIG.ENDPOINTS.LIBRARY.AUTO_GENERATE_METADATA,
  requireUserJwt,
  handleAutoGenerateFileMetadata
);
app.post(
  API_CONFIG.ENDPOINTS.LIBRARY.PROCESS_METADATA_BACKGROUND,
  requireUserJwt,
  handleProcessMetadataBackground
);
app.get(API_CONFIG.ENDPOINTS.LIBRARY.STATS, requireUserJwt, handleGetFileStats);

// Queue handler for file processing
async function queueHandler(batch: MessageBatch<any>, env: Env): Promise<void> {
  console.log(`[File Queue] Processing ${batch.messages.length} messages`);

  for (const message of batch.messages) {
    try {
      console.log(
        `[File Queue] Processing message for file: ${message.body.fileKey}`
      );

      // Update status to processing
      await getDAOFactory(env).fileDAO.updateFileStatus(
        message.body.fileKey,
        message.body.username,
        "processing"
      );

      console.log(
        `[File Queue] Starting file processing for ${message.body.fileKey}`
      );

      // Process the file
      // await ragService.processFileFromR2(
      //   message.body.fileKey,
      //   message.body.username,
      //   env.FILE_BUCKET,
      //   message.body.metadata
      // );

      console.log(
        `[File Queue] File processing completed for ${message.body.fileKey}`
      );

      // Note: AutoRAG indexing is already handled by the processFileFromR2 method above
      // The ragService.processFileFromR2() call already performs:
      // 1. Content extraction and processing
      // 2. AutoRAG indexing for semantic search
      // 3. Metadata generation
      // No additional indexing step is needed.
      console.log(
        `[File Queue] AutoRAG indexing was completed as part of file processing for ${message.body.fileKey}`
      );

      // Complete progress tracking
      completeProgress(message.body.fileKey, true);
      console.log(
        `[File Queue] Successfully processed ${message.body.fileKey}`
      );
    } catch (error) {
      console.error(
        `[File Queue] Error processing ${message.body.fileKey}:`,
        error
      );

      // Determine specific error message
      let errorMessage = "File processing failed";
      let errorDetails = "";

      if (error instanceof Error) {
        errorMessage = error.message;

        // Provide more specific error messages based on the error type
        if (error.message.includes("Unavailable content in document")) {
          errorMessage = "Unavailable content in document";
          errorDetails =
            "The file could not be parsed. It may be encrypted, corrupted, or contain no readable text.";
        } else if (error.message.includes("timeout")) {
          errorMessage = "File processing timeout";
          errorDetails = "The file processing took too long and was cancelled.";
        } else if (error.message.includes("not found in R2")) {
          errorMessage = "File not found in storage";
          errorDetails = "The uploaded file could not be found in storage.";
        } else if (error.message.includes("No OpenAI API key")) {
          errorMessage = "OpenAI API key required";
          errorDetails =
            "File processing requires an OpenAI API key for text analysis.";
        } else {
          errorDetails = error.message;
        }
      }

      // Update status to error with specific error message
      await getDAOFactory(env).fileDAO.updateFileStatus(
        message.body.fileKey,
        message.body.username,
        "error"
      );

      completeProgress(message.body.fileKey, false, errorMessage);

      // Send to dead letter queue for manual review with enhanced error info
      await env.FILE_PROCESSING_DLQ.send({
        fileKey: message.body.fileKey,
        username: message.body.username,
        metadata: message.body.metadata,
        openaiApiKey: message.body.openaiApiKey,
        error: {
          message: errorMessage,
          details: errorDetails,
          originalError: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
      });

      console.log(
        `[File Queue] Sent ${message.body.fileKey} to dead letter queue with error: ${errorMessage}`
      );
    }
  }
}

export default {
  fetch: app.fetch,
  queue: queueHandler,
};

export { queueHandler as queue };

app.get("*", async (c) => {
  const url = new URL(c.req.url);
  const path = url.pathname;

  // Serve index.html for the root path
  if (path === "/") {
    return c.env.ASSETS.fetch(new Request("https://example.com/index.html"));
  }

  // Try to serve static assets
  try {
    const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
    if (assetResponse.status === 200) {
      return assetResponse;
    }
  } catch (_error) {
    console.log("Asset not found:", path);
  }

  // Fallback to agent routing
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
    new Response("Not found", { status: 404 })
  );
});
