import { openai } from "@ai-sdk/openai";
import { routeAgentRequest, type Schedule } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import { generateId, type StreamTextOnFinishCallback, type ToolSet } from "ai";
import type { Context } from "hono";
import { Hono } from "hono";
import { type JWTPayload, jwtVerify, SignJWT } from "jose";
import { CampaignAgent } from "./agents/campaign-agent";
import { GeneralAgent } from "./agents/general-agent";
import { ResourceAgent } from "./agents/resource-agent";
import type { AuthEnv } from "./lib/auth";
import { RAGService } from "./lib/rag";

interface UserAuthPayload extends JWTPayload {
  type: "user-auth";
  username: string;
  openaiApiKey?: string;
}

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

// Helper to get the JWT secret key from env
function getJwtSecret(env: Env): Uint8Array {
  const secret = env.ADMIN_SECRET || process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SECRET not configured");
  }
  return new TextEncoder().encode(secret);
}

// Helper to set user auth context
function setUserAuth(c: Context, payload: UserAuthPayload) {
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
    const { payload } = await jwtVerify(token, getJwtSecret(c.env));
    if (!payload || payload.type !== "user-auth") {
      return c.json({ error: "Invalid token" }, 401);
    }
    // Attach user info to context
    setUserAuth(c, payload as UserAuthPayload);
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
    // Initialize with default model
    const model = openai("gpt-4o-mini");
    this.campaignAgent = new CampaignAgent(ctx, env, model);
    this.resourceAgent = new ResourceAgent(ctx, env, model);
    this.generalAgent = new GeneralAgent(ctx, env, model);

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
      }
    } catch (error) {
      console.error("Error loading user OpenAI API key:", error);
    }
  }

  /**
   * Set the user's OpenAI API key and update all agents
   */
  setUserOpenAIKey(apiKey: string) {
    this.userOpenAIKey = apiKey;
    // Store the API key in the durable object state
    this.ctx.storage.put("userOpenAIKey", apiKey);

    // Create new model instances - the AI SDK will use the environment variable
    // We'll need to modify the environment or handle this differently
    const model = openai("gpt-4o-mini");

    // Update all agents with the new model
    this.campaignAgent = new CampaignAgent(this.ctx, this.env, model);
    this.resourceAgent = new ResourceAgent(this.ctx, this.env, model);
    this.generalAgent = new GeneralAgent(this.ctx, this.env, model);
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
   * Determines which specialized agent should handle the user's request
   */
  private determineAgent(
    userMessage: string
  ): "campaigns" | "resources" | "general" {
    const lowerMessage = userMessage.toLowerCase();

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
    ];

    // Resource/PDF-related keywords
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

    // Check for campaign-related intent
    if (campaignKeywords.some((keyword) => lowerMessage.includes(keyword))) {
      return "campaigns";
    }

    // Check for resource-related intent
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
  const hasOpenAIKey = !!c.env.OPENAI_API_KEY || !!process.env.OPENAI_API_KEY;
  return c.json({ success: hasOpenAIKey });
});

// Set user's OpenAI API key in Chat durable object
app.post("/chat/set-openai-key", requireUserJwt, async (c) => {
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
  const { providedKey, username, openaiApiKey } = await c.req.json();
  const expectedKey = c.env.ADMIN_SECRET || process.env.ADMIN_SECRET;

  // Check if we have a default OpenAI key
  const hasDefaultOpenAIKey =
    !!c.env.OPENAI_API_KEY || !!process.env.OPENAI_API_KEY;

  if (
    !providedKey ||
    !expectedKey ||
    !username ||
    typeof username !== "string" ||
    username.trim() === ""
  ) {
    return c.json({ error: "Missing admin key or username" }, 400);
  }

  if (providedKey !== expectedKey) {
    return c.json({ error: "Invalid admin key" }, 401);
  }

  // If no default OpenAI key is set, require the user to provide one
  if (
    !hasDefaultOpenAIKey &&
    (!openaiApiKey ||
      typeof openaiApiKey !== "string" ||
      openaiApiKey.trim() === "")
  ) {
    return c.json(
      {
        error: "OpenAI API key is required when no default key is configured",
        requiresOpenAIKey: true,
      },
      400
    );
  }

  // Validate OpenAI API key if provided
  if (openaiApiKey && openaiApiKey.trim() !== "") {
    try {
      // Test the OpenAI API key by making a simple request
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
  }

  // Issue JWT with username and OpenAI key (if provided)
  const jwtPayload: UserAuthPayload = {
    type: "user-auth",
    username,
    ...(openaiApiKey && { openaiApiKey: openaiApiKey.trim() }),
  };

  const jwt = await new SignJWT(jwtPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(getJwtSecret(c.env));

  return c.json({
    token: jwt,
    hasDefaultOpenAIKey,
    requiresOpenAIKey: !hasDefaultOpenAIKey,
  });
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

    const ragService = new RAGService(c.env.DB, c.env.VECTORIZE);
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

// RAG Get PDFs Route
app.get("/rag/pdfs", requireUserJwt, async (c) => {
  try {
    const userAuth = (c as any).userAuth;

    const ragService = new RAGService(c.env.DB, c.env.VECTORIZE);
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

    const ragService = new RAGService(c.env.DB, c.env.VECTORIZE);
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

    const ragService = new RAGService(c.env.DB, c.env.VECTORIZE);
    await ragService.deletePdf(fileKey, userAuth.username);

    return c.json({ success: true, message: "PDF deleted successfully" });
  } catch (error) {
    console.error("Error deleting PDF:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Mount campaign agent routes
app.get("/campaigns", requireUserJwt, async (c) => {
  try {
    const userAuth = (c as any).userAuth;
    const userId = userAuth.username;

    const { results } = await c.env.DB.prepare(
      "SELECT * FROM campaigns WHERE username = ? ORDER BY created_at DESC"
    )
      .bind(userId)
      .all();

    console.log(
      `[GET] Listing campaigns for user`,
      userId,
      "found campaigns:",
      results.length
    );

    return c.json({ campaigns: results });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

app.post("/campaigns", requireUserJwt, async (c) => {
  try {
    const { name, description } = await c.req.json();
    const userAuth = (c as any).userAuth;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return c.json({ error: "Campaign name is required" }, 400);
    }

    const userId = userAuth.username;
    const campaignId = crypto.randomUUID();
    const now = new Date().toISOString();

    const campaign = {
      id: campaignId,
      username: userId,
      name: name.trim(),
      description: description?.trim() || null,
      status: "active",
      metadata: JSON.stringify({}),
      created_at: now,
      updated_at: now,
    };

    // Store in D1
    await c.env.DB.prepare(
      "INSERT INTO campaigns (id, username, name, description, status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        campaign.id,
        campaign.username,
        campaign.name,
        campaign.description,
        campaign.status,
        campaign.metadata,
        campaign.created_at,
        campaign.updated_at
      )
      .run();

    console.log(`[POST] Created campaign for user`, userId, ":", campaignId);
    return c.json({ success: true, campaign });
  } catch (error) {
    console.error("Error creating campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
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
