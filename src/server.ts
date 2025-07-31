import { routeAgentRequest, type Schedule } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import { generateId, type StreamTextOnFinishCallback, type ToolSet } from "ai";
import { Hono } from "hono";
import type { AuthEnv } from "./services/auth-service";
import type { AgentType } from "./services/agent-router";
import {
  handleAuthenticate,
  handleGetOpenAIKey,
  handleStoreOpenAIKey,
  handleDeleteOpenAIKey,
  handleCheckOpenAIKey,
  handleSetOpenAIApiKey,
  handleCheckUserOpenAIKey,
  requireUserJwt,
} from "./routes/auth";
import { AuthService } from "./services/auth-service";
import { ModelManager } from "./services/model-manager";
import {
  handleGetCampaigns,
  handleCreateCampaign,
  handleGetCampaign,
  handleGetCampaignResources,
  handleDeleteCampaign,
  handleDeleteAllCampaigns,
} from "./routes/campaigns";
import {
  handleGenerateUploadUrl,
  handleCompleteUpload,
  handleUploadPart,
  handleIngestPdf,
  handleGetPdfFiles,
  handleUpdatePdfMetadata,
  handleAutoGeneratePdfMetadata,
  handleGetPdfStats,
} from "./routes/pdf";
import {
  handleRagSearch,
  handleProcessPdfForRag,
  handleProcessPdfFromR2ForRag,
  handleUpdatePdfMetadataForRag,
  handleGetPdfFilesForRag,
  handleGetPdfChunksForRag,
  handleDeletePdfForRag,
} from "./routes/rag";
import {
  handleGetUserState,
  handleGetAssessmentRecommendations,
  handleGetUserActivity,
  handleModuleIntegration,
} from "./routes/assessment";
import {
  handleGetWelcomeGuidance,
  handleGetNextActions,
  handleGetStateAnalysis,
} from "./routes/onboarding";
import {
  handleGetExternalResourceRecommendations,
  handleGetExternalResourceSearch,
  handleGetGmResources,
} from "./routes/external-resources";
import { handleProgressWebSocket } from "./routes/progress";

interface Env extends AuthEnv {
  ADMIN_SECRET?: string;
  OPENAI_API_KEY?: string;
  PDF_BUCKET: R2Bucket;
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  Chat: DurableObjectNamespace;
  UserFileTracker: DurableObjectNamespace;
}

// Progress tracking store (moved to services/progress.ts)

/**
 * Chat Agent implementation that routes to specialized agents based on user intent
 */
export class Chat extends AIChatAgent<Env> {
  private agents: Map<string, any> = new Map();
  private userOpenAIKey: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Initialize agents lazily - only when API key is available
    // Initialize agents Map (will be populated when agents are created)
    this.agents = new Map();

    // Load user's OpenAI key from storage if available
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

  /**
   * Initialize agents with the provided API key
   */
  private async initializeAgents(apiKey: string) {
    try {
      // Initialize the global model manager with the user's API key
      const modelManager = ModelManager.getInstance();
      modelManager.initializeModel(apiKey);

      // Import the agent registry to ensure agents are registered
      const { AgentRegistryService } = await import(
        "./services/agent-registry"
      );

      // Initialize all agents dynamically using the registry
      const registeredAgentTypes =
        AgentRegistryService.getRegisteredAgentTypes();

      for (const agentType of registeredAgentTypes) {
        const agentInstance = AgentRegistryService.createAgentInstance(
          agentType as AgentType,
          this.ctx,
          this.env
        );

        // Store agent instances in the Map
        this.agents.set(agentType, agentInstance);
      }

      console.log(
        `Agents initialized successfully with user API key: ${registeredAgentTypes.join(", ")}`
      );
    } catch (error) {
      console.error("Error initializing agents:", error);
      throw error;
    }
  }

  // OpenAIKeyCache interface implementation
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
    // Store the API key in the durable object state
    this.ctx.storage.put("userOpenAIKey", apiKey);

    // Initialize agents with the new API key
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

    // For all other requests, use the parent class implementation
    return super.fetch(request);
  }

  /**
   * Determines which specialized agent should handle the user's request
   * based on keywords and intent in the message and conversation context
   */
  private async determineAgent(userMessage: string): Promise<string> {
    // Get the model from the global model manager
    const modelManager = ModelManager.getInstance();
    const model = modelManager.getModel();

    // Call the agent router directly with the model
    const { AgentRouter } = await import("./services/agent-router");

    const intent = await AgentRouter.routeMessage(
      userMessage,
      this.messages
        .slice(-6)
        .map((msg) => msg.content)
        .join(" "),
      null, // ragService
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
      // Get the username from the JWT in the messages
      const lastUserMessage = this.messages
        .slice()
        .reverse()
        .find((msg) => msg.role === "user");

      const username = lastUserMessage
        ? AuthService.extractUsernameFromMessage(lastUserMessage)
        : null;

      if (!username) {
        throw new Error("Unable to determine user. Please authenticate again.");
      }

      // Get API key from database (with caching)
      const apiKey = await AuthService.loadUserOpenAIKeyWithCache(
        username,
        this.env.DB,
        this
      );

      if (!apiKey) {
        // Send a proper error response to the frontend so it can show the auth modal
        console.log(
          "[Chat] No OpenAI API key found for user, sending authentication request"
        );

        // Send a special error that the frontend can detect to show the auth modal
        // This handles all three use cases:
        // 1. First time login: no keys set
        // 2. JWT expiry: keys exist but JWT expired
        // 3. User logout: keys were removed
        console.log("[Chat] Throwing authentication error");
        throw new Error(
          "AUTHENTICATION_REQUIRED: OpenAI API key required. Please authenticate first."
        );
      }

      // Initialize agents with the API key (already cached)
      await this.initializeAgents(apiKey);
    }

    // Get the last user message to determine routing
    const lastUserMessage = this.messages
      .slice()
      .reverse()
      .find((msg) => msg.role === "user");

    if (!lastUserMessage) {
      // No user message found, use campaign-context agent as fallback
      const targetAgentInstance = this.getAgentInstance("campaign-context");
      targetAgentInstance.messages = [...this.messages];
      return targetAgentInstance.onChatMessage(onFinish, {
        abortSignal: _options?.abortSignal,
      });
    }

    // Determine which agent should handle this request
    const targetAgent = await this.determineAgent(lastUserMessage.content);
    console.log(
      `[Chat] Routing to ${targetAgent} agent for message: "${lastUserMessage.content}"`
    );

    // Copy messages to the target agent
    const targetAgentInstance = this.getAgentInstance(targetAgent);
    targetAgentInstance.messages = [...this.messages];

    // Route to the appropriate specialized agent
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
      // Fallback to first available agent if the requested one doesn't exist
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

// Export the UserFileTracker Durable Object
export { UserFileTracker } from "./durable-objects/UserFileTracker";

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
const app = new Hono<{ Bindings: Env }>();

// Global CORS middleware
app.use("*", async (c, next) => {
  // Handle preflight OPTIONS requests
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

app.get("/check-open-ai-key", handleCheckOpenAIKey);
app.get("/check-user-openai-key", handleCheckUserOpenAIKey);
app.post("/chat/set-openai-key", handleSetOpenAIApiKey);

// Authentication and OpenAI Key Management Routes
app.post("/authenticate", handleAuthenticate);
app.get("/get-openai-key", handleGetOpenAIKey);
app.post("/store-openai-key", handleStoreOpenAIKey);
app.delete("/delete-openai-key", handleDeleteOpenAIKey);

// PDF Routes
app.post("/pdf/upload-url", requireUserJwt, handleGenerateUploadUrl);
app.post("/pdf/upload-part", requireUserJwt, handleUploadPart);
app.put("/pdf/upload/*", requireUserJwt, handleCompleteUpload);
app.post("/pdf/ingest", requireUserJwt, handleIngestPdf);
app.get("/pdf/files", requireUserJwt, handleGetPdfFiles);
app.post("/pdf/update-metadata", requireUserJwt, handleUpdatePdfMetadata);
app.post(
  "/pdf/auto-generate-metadata",
  requireUserJwt,
  handleAutoGeneratePdfMetadata
);
app.get("/pdf/stats", requireUserJwt, handleGetPdfStats);

// RAG Routes
app.post("/rag/search", requireUserJwt, handleRagSearch);
app.post("/rag/process-pdf", requireUserJwt, handleProcessPdfForRag);
app.post(
  "/rag/process-pdf-from-r2",
  requireUserJwt,
  handleProcessPdfFromR2ForRag
);
app.put(
  "/rag/pdfs/:fileKey/metadata",
  requireUserJwt,
  handleUpdatePdfMetadataForRag
);
app.get("/rag/pdfs", requireUserJwt, handleGetPdfFilesForRag);
app.get("/rag/pdfs/:fileKey/chunks", requireUserJwt, handleGetPdfChunksForRag);
app.delete("/rag/pdfs/:fileKey", requireUserJwt, handleDeletePdfForRag);

// Campaign Routes
app.get("/campaigns", requireUserJwt, handleGetCampaigns);
app.post("/campaigns", requireUserJwt, handleCreateCampaign);
app.get("/campaigns/:campaignId", requireUserJwt, handleGetCampaign);
app.get(
  "/campaigns/:campaignId/resources",
  requireUserJwt,
  handleGetCampaignResources
);
app.delete("/campaigns/:campaignId", requireUserJwt, handleDeleteCampaign);
app.delete("/campaigns", requireUserJwt, handleDeleteAllCampaigns);

// Note: Campaign agent routes are now handled through the Chat Durable Object
// The new specialized agents (CampaignAgent, CampaignContextAgent, CharacterSheetAgent)
// are AIChatAgent instances without HTTP routes

// Progress WebSocket endpoint
app.get("/progress", handleProgressWebSocket);

// Assessment Routes
app.get("/assessment/user-state", requireUserJwt, handleGetUserState);
app.get(
  "/assessment/campaign-health/:campaignId",
  requireUserJwt,
  handleGetAssessmentRecommendations
);
app.get("/assessment/user-activity", requireUserJwt, handleGetUserActivity);
app.post(
  "/assessment/module-integration",
  requireUserJwt,
  handleModuleIntegration
);

// Onboarding Routes
app.get(
  "/onboarding/welcome-guidance",
  requireUserJwt,
  handleGetWelcomeGuidance
);
app.get("/onboarding/next-actions", requireUserJwt, handleGetNextActions);
app.get(
  "/onboarding/campaign-guidance/:campaignId",
  requireUserJwt,
  handleGetStateAnalysis
);

// External Resources Routes
app.get(
  "/external-resources/recommendations",
  requireUserJwt,
  handleGetExternalResourceRecommendations
);
app.get(
  "/external-resources/inspiration-sources",
  requireUserJwt,
  handleGetExternalResourceSearch
);
app.get(
  "/external-resources/gm-resources",
  requireUserJwt,
  handleGetGmResources
);

// Mount other agent routes
app.all("*", async (c) => {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
    );
  }
  return (
    (await routeAgentRequest(c.req.raw, c.env as any, { cors: true })) ||
    new Response("Not found", { status: 404 })
  );
});

export default app;
