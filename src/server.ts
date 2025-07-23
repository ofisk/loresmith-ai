import { openai } from "@ai-sdk/openai";
import { routeAgentRequest, type Schedule } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import { generateId, type StreamTextOnFinishCallback, type ToolSet } from "ai";
import type { Context } from "hono";
import { Hono } from "hono";
import { jwtVerify, SignJWT } from "jose";
import { CampaignAgent } from "./agents/campaign-agent";
import { GeneralAgent } from "./agents/general-agent";
import { ResourceAgent } from "./agents/resource-agent";
import { MODEL_CONFIG } from "./constants";
import type { AuthEnv } from "./lib/auth";
import { type AuthPayload, authenticateUser, getJwtSecret } from "./lib/auth";
import { RAGService } from "./lib/rag";
import type { ProcessingProgress, ProgressMessage } from "./types/progress";

interface Env extends AuthEnv {
  ADMIN_SECRET?: string;
  OPENAI_API_KEY?: string;
  PDF_BUCKET: R2Bucket;
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  Chat: DurableObjectNamespace;
  UserFileTracker: DurableObjectNamespace;
  CampaignManager: DurableObjectNamespace;
}

// Progress tracking store
const progressStore = new Map<string, ProcessingProgress>();
const progressSubscribers = new Map<string, Set<WebSocket>>();

// Progress management functions
function updateProgress(fileKey: string, progress: ProcessingProgress) {
  progressStore.set(fileKey, progress);

  // Notify subscribers
  const subscribers = progressSubscribers.get(fileKey);
  if (subscribers) {
    const message: ProgressMessage = {
      type: "progress_update",
      data: progress,
    };

    subscribers.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  }
}

function subscribeToProgress(fileKey: string, ws: WebSocket) {
  if (!progressSubscribers.has(fileKey)) {
    progressSubscribers.set(fileKey, new Set());
  }
  progressSubscribers.get(fileKey)!.add(ws);

  // Send current progress if available
  const currentProgress = progressStore.get(fileKey);
  if (currentProgress) {
    const message: ProgressMessage = {
      type: "progress_update",
      data: currentProgress,
    };
    ws.send(JSON.stringify(message));
  }
}

function unsubscribeFromProgress(fileKey: string, ws: WebSocket) {
  const subscribers = progressSubscribers.get(fileKey);
  if (subscribers) {
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      progressSubscribers.delete(fileKey);
    }
  }
}

function completeProgress(
  fileKey: string,
  success: boolean,
  error?: string,
  suggestedMetadata?: any
) {
  const message: ProgressMessage = {
    type: "progress_complete",
    data: {
      fileKey,
      success,
      error,
      suggestedMetadata,
    },
  };

  const subscribers = progressSubscribers.get(fileKey);
  if (subscribers) {
    subscribers.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
    progressSubscribers.delete(fileKey);
  }

  progressStore.delete(fileKey);
}

// Helper to set user auth context
function setUserAuth(c: Context, payload: AuthPayload) {
  (c as any).userAuth = payload;
}

// Middleware to require JWT for mutating endpoints
async function requireUserJwt(
  c: Context,
  next: () => Promise<void>
): Promise<Response | undefined> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }
  const token = authHeader.slice(7);
  try {
    const jwtSecret = await getJwtSecret(c.env);
    const { payload } = await jwtVerify(token, jwtSecret);
    if (!payload || payload.type !== "user-auth") {
      return c.json({ error: "Invalid token" }, 401);
    }
    // Attach user info to context
    setUserAuth(c, payload as AuthPayload);
    await next();
  } catch (_err) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}

console.log("Server file loaded and running");

/**
 * Chat Agent implementation that routes to specialized agents based on user intent
 */
export class Chat extends AIChatAgent<Env> {
  private campaignAgent: CampaignAgent;
  private resourceAgent: ResourceAgent;
  private generalAgent: GeneralAgent;
  private userOpenAIKey: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Initialize agents lazily - only when API key is available
    this.campaignAgent = null as any;
    this.resourceAgent = null as any;
    this.generalAgent = null as any;

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
        this.userOpenAIKey = storedKey;
        console.log("Loaded user OpenAI API key from storage");
        // Initialize agents with the stored key
        this.initializeAgents(storedKey);
      }
    } catch (error) {
      console.error("Error loading user OpenAI API key:", error);
    }
  }

  /**
   * Initialize agents with the provided API key
   */
  private initializeAgents(apiKey: string) {
    try {
      // Set the API key in the environment for the model creation
      const originalApiKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = apiKey;

      try {
        // Create the model - it will use the API key from the environment
        const model = openai(MODEL_CONFIG.OPENAI.PRIMARY as any);

        // Initialize all agents with the new model
        this.campaignAgent = new CampaignAgent(this.ctx, this.env, model);
        this.resourceAgent = new ResourceAgent(this.ctx, this.env, model);
        this.generalAgent = new GeneralAgent(this.ctx, this.env, model);

        console.log("Agents initialized successfully with user API key");

        // Keep the API key in the environment for the agents to use
        // Don't restore the original value since the agents need this API key
      } catch (error) {
        // Restore the original API key if there was an error
        if (originalApiKey === undefined) {
          delete (process.env as any).OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = originalApiKey;
        }
        throw error;
      }
    } catch (error) {
      console.error("Error initializing agents:", error);
      throw error;
    }
  }

  /**
   * Set the user's OpenAI API key and update all agents
   */
  setUserOpenAIKey(apiKey: string) {
    this.userOpenAIKey = apiKey;
    // Store the API key in the durable object state
    this.ctx.storage.put("userOpenAIKey", apiKey);

    // Initialize agents with the new API key
    this.initializeAgents(apiKey);
  }

  /**
   * Get the user's OpenAI API key if available
   */
  getUserOpenAIKey(): string | null {
    return this.userOpenAIKey;
  }

  /**
   * Handle HTTP requests to the Chat durable object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/set-openai-key") {
      return this.handleSetOpenAIKey(request);
    }

    if (path === "/get-user-openai-key") {
      return this.handleGetUserOpenAIKey(request);
    }

    // For all other requests, use the parent class implementation
    return super.fetch(request);
  }

  /**
   * Handle setting the user's OpenAI API key
   */
  private async handleSetOpenAIKey(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as { openaiApiKey?: string };
      const { openaiApiKey } = body;

      if (
        !openaiApiKey ||
        typeof openaiApiKey !== "string" ||
        openaiApiKey.trim() === ""
      ) {
        return new Response(
          JSON.stringify({ error: "OpenAI API key is required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // Set the user's OpenAI API key
      this.setUserOpenAIKey(openaiApiKey.trim());

      return new Response(
        JSON.stringify({
          success: true,
          message: "OpenAI API key set successfully",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error("Error in handleSetOpenAIKey:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  /**
   * Handle getting the user's stored OpenAI API key
   */
  private async handleGetUserOpenAIKey(_request: Request): Promise<Response> {
    try {
      const apiKey = this.getUserOpenAIKey();

      return new Response(
        JSON.stringify({
          apiKey: apiKey,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error("Error in handleGetUserOpenAIKey:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  /**
   * Determines which specialized agent should handle the user's request
   * based on keywords and intent in the message and conversation context
   */
  private determineAgent(
    userMessage: string
  ): "campaigns" | "resources" | "general" {
    const lowerMessage = userMessage.toLowerCase();

    // Check for retry/continue context - if the last few messages were campaign-related
    if (
      lowerMessage.includes("retry") ||
      lowerMessage.includes("continue") ||
      lowerMessage.includes("again")
    ) {
      // Look at recent conversation context to determine what to retry
      const recentMessages = this.messages.slice(-6); // Last 6 messages
      const recentContext = recentMessages
        .map((msg) => msg.content)
        .join(" ")
        .toLowerCase();

      // If recent context contains campaign keywords, route to campaigns
      const campaignContextKeywords = [
        "campaign",
        "character",
        "backstory",
        "curse of strahd",
        "barovia",
        "strahd",
        "melian",
        "baron la croix",
        "endinel",
        "istelle",
        "calbis",
        "avren",
        "horror",
        "d&d",
        "dungeons and dragons",
        "session",
        "planning",
      ];

      if (
        campaignContextKeywords.some((keyword) =>
          recentContext.includes(keyword)
        )
      ) {
        return "campaigns";
      }
    }

    // Campaign-related keywords
    const campaignKeywords = [
      "campaign",
      "campaigns",
      "create campaign",
      "list campaigns",
      "show campaigns",
      "campaign details",
      "add resource to campaign",
      "campaign resource",
      "delete campaign",
      // RAG and resource discovery keywords
      "find resources",
      "search for",
      "suggest resources",
      "what resources",
      "pdf library",
      "d&d resources",
      "monster manual",
      "spell book",
      "adventure module",
      "world building",
      "campaign planning",
      "session planning",
      "character backstory",
      "player characters",
      "party composition",
      "campaign tone",
      "setting preferences",
      "special considerations",
      // Character names and specific campaign content
      "melian",
      "baron la croix",
      "endinel",
      "istelle",
      "calbis",
      "avren",
      "curse of strahd",
      "barovia",
      "strahd",
      "horror",
      "d&d",
      "dungeons and dragons",
    ];

    // Resource/PDF-related keywords (for uploads and management)
    const resourceKeywords = [
      "pdf",
      "upload",
      "file",
      "files",
      "document",
      "documents",
      "list pdf",
      "upload pdf",
      "pdf stats",
      "pdf metadata",
      "ingest pdf",
      "process pdf",
      "delete pdf",
      "update pdf",
    ];

    // General/scheduling keywords
    const generalKeywords = [
      "schedule",
      "task",
      "tasks",
      "scheduled",
      "cancel task",
      "list tasks",
      "reminder",
      "reminders",
    ];

    // Check for campaign-related intent (including RAG search)
    if (campaignKeywords.some((keyword) => lowerMessage.includes(keyword))) {
      return "campaigns";
    }

    // Check for resource-related intent (PDF management only)
    if (resourceKeywords.some((keyword) => lowerMessage.includes(keyword))) {
      return "resources";
    }

    // Check for general/scheduling intent
    if (generalKeywords.some((keyword) => lowerMessage.includes(keyword))) {
      return "general";
    }

    // Default to general agent for unknown intents
    return "general";
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
    if (!this.campaignAgent || !this.resourceAgent || !this.generalAgent) {
      // Try to load the user's API key and initialize agents
      if (this.userOpenAIKey) {
        this.initializeAgents(this.userOpenAIKey);
      } else {
        // Try to load from storage
        try {
          const storedKey = await this.ctx.storage.get<string>("userOpenAIKey");
          if (storedKey) {
            this.userOpenAIKey = storedKey;
            this.initializeAgents(storedKey);
          } else {
            // No API key available
            throw new Error(
              "Please set your OpenAI API key to use the chat functionality. You can do this by clicking the 'Set API Key' button in the modal."
            );
          }
        } catch (error) {
          console.error("Error loading stored API key:", error);
          throw new Error(
            "Please set your OpenAI API key to use the chat functionality. You can do this by clicking the 'Set API Key' button in the modal."
          );
        }
      }
    }

    // Get the last user message to determine routing
    const lastUserMessage = this.messages
      .slice()
      .reverse()
      .find((msg) => msg.role === "user");

    if (!lastUserMessage) {
      // No user message found, use general agent
      return this.generalAgent.onChatMessage(onFinish, _options);
    }

    // Determine which agent should handle this request
    const targetAgent = this.determineAgent(lastUserMessage.content);
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
  private getAgentInstance(
    targetAgent: "campaigns" | "resources" | "general"
  ): any {
    // Check if agents are initialized
    if (!this.campaignAgent || !this.resourceAgent || !this.generalAgent) {
      // Try to load the user's API key and initialize agents
      if (this.userOpenAIKey) {
        this.initializeAgents(this.userOpenAIKey);
      } else {
        throw new Error(
          "Agents not initialized. Please set an OpenAI API key first."
        );
      }
    }

    switch (targetAgent) {
      case "campaigns":
        return this.campaignAgent;
      case "resources":
        return this.resourceAgent;
      case "general":
        return this.generalAgent;
      default:
        return this.generalAgent;
    }
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
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  await next();
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
});

app.get("/check-open-ai-key", (c) => {
  const envKey =
    !!c.env.OPENAI_API_KEY && c.env.OPENAI_API_KEY.trim().length > 0;
  const processKey =
    !!process.env.OPENAI_API_KEY &&
    process.env.OPENAI_API_KEY.trim().length > 0 &&
    process.env.OPENAI_API_KEY !== "undefined";
  const hasOpenAIKey = envKey || processKey;

  console.log("OpenAI key check:", {
    envKey,
    processKey,
    hasOpenAIKey,
    envKeyValue: c.env.OPENAI_API_KEY,
    envKeyLength: c.env.OPENAI_API_KEY?.length || 0,
    processKeyValue: process.env.OPENAI_API_KEY,
    processKeyLength: process.env.OPENAI_API_KEY?.length || 0,
  });

  return c.json({
    success: hasOpenAIKey,
    debug: {
      envKey,
      processKey,
      hasOpenAIKey,
      envKeyValue: c.env.OPENAI_API_KEY,
      envKeyLength: c.env.OPENAI_API_KEY?.length || 0,
      processKeyValue: process.env.OPENAI_API_KEY,
      processKeyLength: process.env.OPENAI_API_KEY?.length || 0,
    },
  });
});

app.get("/check-user-openai-key", async (c) => {
  try {
    // Check if user has already set an API key in their session
    const sessionId = c.req.header("X-Session-ID") || "default";
    const chatId = c.env.Chat.idFromName(sessionId);
    const chat = c.env.Chat.get(chatId);

    // Try to get the user's stored API key
    const response = await chat.fetch(
      new Request("http://localhost/get-user-openai-key", {
        method: "GET",
      })
    );

    if (response.ok) {
      const result = (await response.json()) as { apiKey?: string };
      const hasUserStoredKey =
        !!result.apiKey && result.apiKey.trim().length > 0;

      console.log("User OpenAI key check:", {
        sessionId,
        hasUserStoredKey,
        apiKeyLength: result.apiKey?.length || 0,
      });

      return c.json({
        success: hasUserStoredKey,
        hasUserStoredKey,
      });
    }

    return c.json({ success: false, hasUserStoredKey: false });
  } catch (error) {
    console.error("Error checking user OpenAI key:", error);
    return c.json({ success: false, hasUserStoredKey: false });
  }
});

// Set user's OpenAI API key in Chat durable object
app.post("/chat/set-openai-key", async (c) => {
  try {
    const { openaiApiKey } = await c.req.json();
    if (
      !openaiApiKey ||
      typeof openaiApiKey !== "string" ||
      openaiApiKey.trim() === ""
    ) {
      return c.json({ error: "OpenAI API key is required" }, 400);
    }

    // Validate the OpenAI API key
    try {
      const testResponse = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${openaiApiKey.trim()}`,
          "Content-Type": "application/json",
        },
      });

      if (!testResponse.ok) {
        return c.json({ error: "Invalid OpenAI API key" }, 400);
      }
    } catch (error) {
      console.error("Error validating OpenAI API key:", error);
      return c.json({ error: "Failed to validate OpenAI API key" }, 400);
    }

    // Get the Chat durable object for this session
    const sessionId = c.req.header("X-Session-ID") || "default";
    const chatId = c.env.Chat.idFromName(sessionId);
    const chat = c.env.Chat.get(chatId);

    // Call the Chat durable object to set the API key
    const response = await chat.fetch(
      new Request("http://localhost/set-openai-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${c.req.header("Authorization")}`,
        },
        body: JSON.stringify({ openaiApiKey: openaiApiKey.trim() }),
      })
    );

    if (!response.ok) {
      const error = await response.text();
      return c.json({ error: `Failed to set OpenAI API key: ${error}` }, 500);
    }

    return c.json({
      success: true,
      message: "OpenAI API key set successfully",
    });
  } catch (error) {
    console.error("Error setting OpenAI API key:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// User Authentication Route (returns JWT)
app.post("/auth/authenticate", async (c) => {
  try {
    const { providedKey, username, openaiApiKey } = await c.req.json();
    const sessionId = c.req.header("X-Session-ID") || "default";

    const result = await authenticateUser(
      { providedKey, username, openaiApiKey, sessionId },
      c.env
    );

    if (!result.success) {
      const statusCode = result.error?.includes("Invalid admin key")
        ? 401
        : 400;
      return c.json({ error: result.error }, statusCode);
    }

    return c.json({
      token: result.token,
      hasDefaultOpenAIKey: result.hasDefaultOpenAIKey,
      requiresOpenAIKey: result.requiresOpenAIKey,
    });
  } catch (error) {
    console.error("Authentication error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PDF Upload URL Route (for presigned uploads)
app.post("/pdf/upload-url", requireUserJwt, async (c) => {
  try {
    const { fileName, fileSize } = await c.req.json();
    const userAuth = (c as any).userAuth;

    console.log("Upload URL request received for user:", userAuth.username);
    console.log("FileName:", fileName);
    console.log("FileSize:", fileSize);

    if (!fileName) {
      console.log("Missing fileName");
      return c.json({ error: "fileName is required" }, 400);
    }

    // Generate unique file key using username from JWT
    const fileKey = `uploads/${userAuth.username}/${fileName}`;

    // Generate direct upload URL to R2 bucket
    // This creates a URL that uploads directly to R2, bypassing the worker
    const uploadUrl = `/pdf/upload/${fileKey}`;

    console.log("Generated fileKey:", fileKey);
    console.log("Generated uploadUrl:", uploadUrl);

    return c.json({
      uploadUrl,
      fileKey,
      username: userAuth.username,
    });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Direct PDF Upload Route
app.put("/pdf/upload/*", requireUserJwt, async (c) => {
  try {
    const pathname = new URL(c.req.url).pathname;
    const fileKey = pathname.replace("/pdf/upload/", "");

    if (!fileKey) {
      return c.json({ error: "fileKey parameter is required" }, 400);
    }

    // Get the file content from the request body
    const fileContent = await c.req.arrayBuffer();

    if (fileContent.byteLength === 0) {
      return c.json({ error: "File content is empty" }, 400);
    }

    // Upload to R2
    await c.env.PDF_BUCKET.put(fileKey, fileContent, {
      httpMetadata: {
        contentType: "application/pdf",
      },
    });

    return c.json({
      success: true,
      fileKey,
      message: "File uploaded successfully",
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PDF Ingest Route
app.post("/pdf/ingest", requireUserJwt, async (c) => {
  try {
    const { fileKey } = await c.req.json();
    const userAuth = (c as any).userAuth;

    if (!fileKey) {
      return c.json({ error: "fileKey is required" }, 400);
    }

    // Verify the fileKey belongs to the authenticated user
    if (!fileKey.startsWith(`uploads/${userAuth.username}/`)) {
      return c.json({ error: "Access denied to this file" }, 403);
    }

    // Simulate parsing process
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return c.json({
      success: true,
      fileKey,
      status: "parsed",
      username: userAuth.username,
    });
  } catch (error) {
    console.error("Error ingesting PDF:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Get Files Route
app.get("/pdf/files", requireUserJwt, async (c) => {
  try {
    const userAuth = (c as any).userAuth;

    // List files from R2 bucket for this user
    const prefix = `uploads/${userAuth.username}/`;
    const objects = await c.env.PDF_BUCKET.list({ prefix });

    const files = objects.objects.map((obj) => ({
      fileKey: obj.key,
      fileName: obj.key.replace(prefix, ""),
      fileSize: obj.size,
      uploaded: obj.uploaded,
      status: "uploaded", // All files in R2 are considered uploaded
    }));

    return c.json({ files });
  } catch (error) {
    console.error("Error getting files:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PDF Update Metadata Route
app.post("/pdf/update-metadata", requireUserJwt, async (c) => {
  try {
    const { fileKey, metadata } = await c.req.json();
    const userAuth = (c as any).userAuth;

    if (!fileKey || !metadata) {
      return c.json({ error: "fileKey and metadata are required" }, 400);
    }

    // Verify the fileKey belongs to the authenticated user
    if (!fileKey.startsWith(`uploads/${userAuth.username}/`)) {
      return c.json({ error: "Access denied to this file" }, 403);
    }

    // Store metadata in R2 bucket as a separate object
    const metadataKey = `${fileKey}.metadata`;
    await c.env.PDF_BUCKET.put(metadataKey, JSON.stringify(metadata), {
      httpMetadata: {
        contentType: "application/json",
      },
    });

    return c.json({
      success: true,
      fileKey,
      username: userAuth.username,
    });
  } catch (error) {
    console.error("Error updating metadata:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PDF Stats Route
app.get("/pdf/stats", requireUserJwt, async (c) => {
  try {
    const userAuth = (c as any).userAuth;

    // Get stats for this user's files
    const prefix = `uploads/${userAuth.username}/`;
    const objects = await c.env.PDF_BUCKET.list({ prefix });

    const totalFiles = objects.objects.length;
    const filesByStatus = {
      uploading: 0,
      uploaded: totalFiles,
      parsing: 0,
      parsed: 0,
      error: 0,
    };

    return c.json({
      username: userAuth.username,
      totalFiles,
      filesByStatus,
    });
  } catch (error) {
    console.error("Error getting stats:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// RAG Search Route
app.post("/rag/search", requireUserJwt, async (c) => {
  try {
    const userAuth = (c as any).userAuth;
    const { query, limit = 10 } = await c.req.json();

    if (!query || typeof query !== "string") {
      return c.json({ error: "Query is required" }, 400);
    }

    const ragService = new RAGService(
      c.env.DB,
      c.env.VECTORIZE,
      c.env.OPENAI_API_KEY
    );
    const results = await ragService.searchContent(
      userAuth.username,
      query,
      limit
    );

    return c.json({ results });
  } catch (error) {
    console.error("Error searching RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// RAG Process PDF Route
app.post("/rag/process-pdf", requireUserJwt, async (c) => {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey, content, metadata } = await c.req.json();

    if (!fileKey || !content) {
      return c.json({ error: "File key and content are required" }, 400);
    }

    const ragService = new RAGService(c.env.DB, c.env.VECTORIZE);
    await ragService.processPdf(
      fileKey,
      userAuth.username,
      content,
      metadata || {}
    );

    return c.json({ success: true, message: "PDF processed successfully" });
  } catch (error) {
    console.error("Error processing PDF for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// RAG Process PDF from R2 Route
app.post("/rag/process-pdf-from-r2", requireUserJwt, async (c) => {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey, metadata } = await c.req.json();

    if (!fileKey) {
      return c.json({ error: "File key is required" }, 400);
    }

    // Create progress callback
    const progressCallback = (progress: ProcessingProgress) => {
      updateProgress(fileKey, progress);
    };

    const ragService = new RAGService(
      c.env.DB,
      c.env.VECTORIZE,
      c.env.OPENAI_API_KEY,
      progressCallback
    );

    try {
      const result = await ragService.processPdfFromR2(
        fileKey,
        userAuth.username,
        c.env.PDF_BUCKET,
        metadata || {}
      );

      // Complete progress successfully
      completeProgress(fileKey, true, undefined, result.suggestedMetadata);

      return c.json({
        success: true,
        message: "PDF processed successfully from R2",
        suggestedMetadata: result.suggestedMetadata,
      });
    } catch (processingError) {
      // Complete progress with error
      completeProgress(
        fileKey,
        false,
        processingError instanceof Error
          ? processingError.message
          : String(processingError)
      );
      throw processingError;
    }
  } catch (error) {
    console.error("Error processing PDF from R2 for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// RAG Update PDF Metadata Route
app.put("/rag/pdfs/:fileKey/metadata", requireUserJwt, async (c) => {
  try {
    const userAuth = (c as any).userAuth;
    const fileKey = c.req.param("fileKey");
    const { description, tags } = await c.req.json();

    if (!fileKey) {
      return c.json({ error: "File key is required" }, 400);
    }

    const ragService = new RAGService(
      c.env.DB,
      c.env.VECTORIZE,
      c.env.OPENAI_API_KEY
    );
    const result = await ragService.updatePdfMetadata(
      fileKey,
      userAuth.username,
      {
        description,
        tags,
      },
      true
    ); // Regenerate suggestions

    return c.json({
      success: true,
      message: "PDF metadata updated successfully",
      suggestions: result.suggestions,
    });
  } catch (error) {
    console.error("Error updating PDF metadata:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// RAG Get PDFs Route
app.get("/rag/pdfs", requireUserJwt, async (c) => {
  try {
    const userAuth = (c as any).userAuth;

    const ragService = new RAGService(
      c.env.DB,
      c.env.VECTORIZE,
      c.env.OPENAI_API_KEY
    );
    const pdfs = await ragService.getUserPdfs(userAuth.username);

    return c.json({ pdfs });
  } catch (error) {
    console.error("Error getting PDFs:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// RAG Get PDF Chunks Route
app.get("/rag/pdfs/:fileKey/chunks", requireUserJwt, async (c) => {
  try {
    const userAuth = (c as any).userAuth;
    const fileKey = c.req.param("fileKey");

    if (!fileKey) {
      return c.json({ error: "File key is required" }, 400);
    }

    const ragService = new RAGService(
      c.env.DB,
      c.env.VECTORIZE,
      c.env.OPENAI_API_KEY
    );
    const chunks = await ragService.getPdfChunks(fileKey, userAuth.username);

    return c.json({ chunks });
  } catch (error) {
    console.error("Error getting PDF chunks:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// RAG Delete PDF Route
app.delete("/rag/pdfs/:fileKey", requireUserJwt, async (c) => {
  try {
    const userAuth = (c as any).userAuth;
    const fileKey = c.req.param("fileKey");

    if (!fileKey) {
      return c.json({ error: "File key is required" }, 400);
    }

    const ragService = new RAGService(
      c.env.DB,
      c.env.VECTORIZE,
      c.env.OPENAI_API_KEY
    );
    await ragService.deletePdf(fileKey, userAuth.username);

    return c.json({ success: true, message: "PDF deleted successfully" });
  } catch (error) {
    console.error("Error deleting PDF:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Mount campaign agent routes
app.all("/campaigns/*", requireUserJwt, async (c) => {
  try {
    // Create a campaign agent instance to handle the request
    const campaignAgent = new CampaignAgent(
      {} as DurableObjectState, // We don't need the actual state for HTTP requests
      c.env,
      openai(MODEL_CONFIG.OPENAI.PRIMARY)
    );

    // Create a new request with the authentication context properly set
    const userAuth = (c as any).userAuth;
    const newRequest = new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers: c.req.raw.headers,
      body: c.req.raw.body,
    });

    // Add the Authorization header if it's not already present
    if (!newRequest.headers.get("Authorization") && userAuth) {
      // Create a JWT token for the user
      const secret = await getJwtSecret(c.env);
      const token = await new SignJWT({
        type: "user-auth",
        username: userAuth.username,
        openaiApiKey: userAuth.openaiApiKey,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("24h")
        .sign(secret);

      newRequest.headers.set("Authorization", `Bearer ${token}`);
    }

    // Forward the request to the campaign agent
    return await campaignAgent.handleHttpRequest(newRequest, c.env);
  } catch (error) {
    console.error("Error in campaign agent route:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Progress WebSocket endpoint
app.get("/progress", async (c) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (upgradeHeader !== "websocket") {
    return c.json({ error: "WebSocket upgrade required" }, 400);
  }

  const { 0: client, 1: server } = new WebSocketPair();

  server.accept();

  server.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data as string);
      if (data.type === "subscribe" && data.fileKey) {
        subscribeToProgress(data.fileKey, server);
      }
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  });

  server.addEventListener("close", () => {
    // Clean up subscriptions when WebSocket closes
    progressSubscribers.forEach((subscribers, fileKey) => {
      if (subscribers.has(server)) {
        unsubscribeFromProgress(fileKey, server);
      }
    });
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
});

// Mount other agent routes
app.all("*", async (c) => {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
    );
  }
  return (
    (await routeAgentRequest(c.req.raw, c.env, { cors: true })) ||
    new Response("Not found", { status: 404 })
  );
});

export default app;

// Export Durable Objects
export { CampaignManager } from "./durable-objects/CampaignManager";
