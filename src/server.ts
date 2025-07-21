import { openai } from "@ai-sdk/openai";
import { routeAgentRequest, type Schedule } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import { generateId, type StreamTextOnFinishCallback, type ToolSet } from "ai";
import type { Context } from "hono";
import { Hono } from "hono";
import { type JWTPayload, jwtVerify, SignJWT } from "jose";
import campaignAgent from "./agents/campaign";
import { CampaignsAgent } from "./agents/campaigns-agent";
import { GeneralAgent } from "./agents/general-agent";
import { ResourceAgent } from "./agents/resource-agent";

interface UserAuthPayload extends JWTPayload {
  type: "user-auth";
  username: string;
}

interface Env {
  ADMIN_SECRET?: string;
  PDF_BUCKET: R2Bucket;
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
  private campaignsAgent: CampaignsAgent;
  private resourceAgent: ResourceAgent;
  private generalAgent: GeneralAgent;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const model = openai("gpt-4o-mini");
    this.campaignsAgent = new CampaignsAgent(ctx, env, model);
    this.resourceAgent = new ResourceAgent(ctx, env, model);
    this.generalAgent = new GeneralAgent(ctx, env, model);
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
  ): AIChatAgent<Env> {
    switch (targetAgent) {
      case "campaigns":
        return this.campaignsAgent;
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
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  return c.json({ success: hasOpenAIKey });
});

// User Authentication Route (returns JWT)
app.post("/auth/authenticate", async (c) => {
  const { providedKey, username } = await c.req.json();
  const expectedKey = c.env.ADMIN_SECRET || process.env.ADMIN_SECRET;
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
  // Issue JWT with username
  const jwt = await new SignJWT({ type: "user-auth", username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(getJwtSecret(c.env));
  return c.json({ token: jwt });
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

// Mount campaign agent routes
app.route("/", campaignAgent);

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
