import { type Schedule, routeAgentRequest } from "agents";

import { unstable_getSchedulePrompt } from "agents/schedule";

import { openai } from "@ai-sdk/openai";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  type StreamTextOnFinishCallback,
  type ToolSet,
  createDataStreamResponse,
  generateId,
  streamText,
} from "ai";
import { Hono } from "hono";
import type { Context } from "hono";
import { type JWTPayload, SignJWT, jwtVerify } from "jose";
import { executions, tools } from "./tools";
import { processToolCalls } from "./utils";

interface PdfAuthPayload extends JWTPayload {
  type: "pdf-auth";
  username: string;
}

interface MessageData {
  jwt?: string;
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
  if (!secret) throw new Error("ADMIN_SECRET not set");
  return new TextEncoder().encode(secret);
}

// Helper to safely attach pdfAuth to context
function setPdfAuth(c: Context, payload: PdfAuthPayload) {
  (c as unknown as { pdfAuth: PdfAuthPayload }).pdfAuth = payload;
}

// Middleware to require JWT for mutating PDF endpoints
async function requirePdfJwt(
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
    if (!payload || payload.type !== "pdf-auth") {
      return c.json({ error: "Invalid token" }, 401);
    }
    // Attach user info to context
    setPdfAuth(c, payload as PdfAuthPayload);
    await next();
  } catch (err) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}

// Helper to extract userId (username) from JWT in Authorization header
async function getUserIdFromJwt(c: Context): Promise<string | null> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(c.env));
    if (!payload || payload.type !== "pdf-auth" || !payload.username) {
      return null;
    }
    return payload.username as string;
  } catch (err) {
    return null;
  }
}

const model = openai("gpt-4o-mini");

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   * @param onFinish - Callback function executed when streaming completes
   */

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.unstable_getAITools(),
    };

    // Create a streaming response that handles both text and tool outputs
    const dataStreamResponse = createDataStreamResponse({
      execute: async (dataStream) => {
        // Extract JWT from the last user message if available
        const lastUserMessage = this.messages
          .slice()
          .reverse()
          .find((msg) => msg.role === "user");

        console.log("[Agent] Last user message:", lastUserMessage);
        let clientJwt: string | null = null;
        if (
          lastUserMessage &&
          "data" in lastUserMessage &&
          lastUserMessage.data
        ) {
          console.log("[Agent] lastUserMessage.data:", lastUserMessage.data);
          const messageData = lastUserMessage.data as MessageData;
          clientJwt = messageData.jwt || null;
          console.log("[Agent] Extracted JWT from user message:", clientJwt);
        } else {
          console.log("[Agent] No JWT found in user message data.");
        }

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: this.messages,
          dataStream,
          tools: allTools,
          executions,
        });

        // Create enhanced tools that automatically include JWT for PDF and campaign operations
        const enhancedTools = Object.fromEntries(
          Object.entries(allTools).map(([toolName, tool]) => {
            if (
              toolName === "listPdfFiles" ||
              toolName === "generatePdfUploadUrl" ||
              toolName === "updatePdfMetadata" ||
              toolName === "ingestPdfFile" ||
              toolName === "getPdfStats" || // Add getPdfStats to always receive JWT
              toolName === "listCampaigns" ||
              toolName === "createCampaign"
            ) {
              return [
                toolName,
                {
                  ...tool,
                  // biome-ignore lint/suspicious/noExplicitAny: needed for tool interface
                  execute: async (args: any, context: any) => {
                    // For PDF and campaign tools, ensure JWT is always included
                    const enhancedArgs = { ...args, jwt: clientJwt };
                    console.log(
                      `[Agent] Calling tool ${toolName} with args:`,
                      enhancedArgs
                    );
                    return tool.execute(enhancedArgs, context);
                  },
                },
              ];
            }
            return [toolName, tool];
          })
        );

        // Stream the AI response using GPT-4
        const result = streamText({
          model,
          system: `You are a helpful assistant that can do various tasks... 

${unstable_getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.

The user can authenticate for PDF upload functionality through the UI. Once authenticated, you can help them with PDF uploads and processing.

**PDF Upload Flow:**
When a user wants to upload a PDF file, follow this process:

1. **Generate Upload URL**: Use the generatePdfUploadUrl tool to create a presigned upload URL for the file
2. **User Uploads File**: The user will upload the file directly to R2 storage using the provided URL
3. **Update Metadata**: After successful upload, use the updatePdfMetadata tool to add description, tags, and file size
4. **Trigger Ingestion**: Use the ingestPdfFile tool to start processing the uploaded PDF

**Campaign Management Flow:**
When a user wants to manage campaigns, follow this process:

1. **List Campaigns**: Use the listCampaigns tool to see all existing campaigns for the user
2. **Create Campaign**: Use the createCampaign tool to create a new campaign with a name
3. **Campaign Operations**: All campaign operations are user-based using JWT authentication

**Important User Management:**
- PDF and campaign operations are now user-based using JWT authentication
- Users authenticate with username and admin key to get a JWT token
- All operations use the authenticated user's context

**Example Campaign Flow:**
- User: "Show me my campaigns"
- You: Call listCampaigns tool to fetch and display all campaigns
- User: "Create a new campaign called 'Lost Mine of Phandelver'"
- You: Call createCampaign tool with name="Lost Mine of Phandelver"

**Example PDF Flow:**
- User: "Please generate an upload URL for my PDF file 'document.pdf' (2.5 MB)"
- You: Call generatePdfUploadUrl tool with fileName="document.pdf", fileSize=2621440
- User: "I have successfully uploaded the PDF file 'document.pdf' with file key 'uploads/username/abc-123-document.pdf'. Please update the metadata..."
- You: Call updatePdfMetadata tool with the file key and metadata, then call ingestPdfFile tool

**Other Operations:**
- Use checkPdfAuthStatus to verify authentication (pass sessionId if provided)
- Use listPdfFiles to show uploaded files
- Use getPdfStats for upload statistics

Always use the appropriate tools for operations and guide users through the process step by step.
`,
          messages: processedMessages,
          tools: enhancedTools,
          onFinish: async (args) => {
            onFinish(
              args as Parameters<StreamTextOnFinishCallback<ToolSet>>[0]
            );
            // await this.mcp.closeConnection(mcpConnection.id);
          },
          onError: (error) => {
            console.error("Error while streaming:", error);
          },
          maxSteps: 10,
        });

        // Merge the AI response stream with tool execution outputs
        result.mergeIntoDataStream(dataStream);
      },
    });

    return dataStreamResponse;
  }
  async executeTask(description: string, task: Schedule<string>) {
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

// CORS middleware for PDF routes
app.use("/pdf/*", async (c, next) => {
  // Handle CORS preflight requests
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Add CORS headers to all PDF route responses
  await next();
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
});

app.get("/check-open-ai-key", (c) => {
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  return c.json({ success: hasOpenAIKey });
});

// PDF Authentication Route (returns JWT)
app.post("/pdf/authenticate", async (c) => {
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
  const jwt = await new SignJWT({ type: "pdf-auth", username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(getJwtSecret(c.env));
  return c.json({ token: jwt });
});

// PDF Upload URL Route (for presigned uploads)
app.post("/pdf/upload-url", requirePdfJwt, async (c) => {
  try {
    const { fileName, fileSize } = await c.req.json();
    // biome-ignore lint/suspicious/noExplicitAny: needed for framework compatibility
    const pdfAuth = (c as any).pdfAuth;

    console.log("Upload URL request received for user:", pdfAuth.username);
    console.log("FileName:", fileName);
    console.log("FileSize:", fileSize);

    if (!fileName) {
      console.log("Missing fileName");
      return c.json({ error: "fileName is required" }, 400);
    }

    // Generate unique file key using username from JWT
    const fileKey = `uploads/${pdfAuth.username}/${fileName}`;

    // Generate direct upload URL to R2 bucket
    // This creates a URL that uploads directly to R2, bypassing the worker
    const uploadUrl = `/pdf/upload/${fileKey}`;

    console.log("Generated fileKey:", fileKey);
    console.log("Generated uploadUrl:", uploadUrl);

    return c.json({
      uploadUrl,
      fileKey,
      username: pdfAuth.username,
    });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Direct PDF Upload Route
app.put("/pdf/upload/*", requirePdfJwt, async (c) => {
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
app.post("/pdf/ingest", requirePdfJwt, async (c) => {
  try {
    const { fileKey } = await c.req.json();
    // biome-ignore lint/suspicious/noExplicitAny: needed for framework compatibility
    const pdfAuth = (c as any).pdfAuth;

    if (!fileKey) {
      return c.json({ error: "fileKey is required" }, 400);
    }

    // Verify the fileKey belongs to the authenticated user
    if (!fileKey.startsWith(`uploads/${pdfAuth.username}/`)) {
      return c.json({ error: "Access denied to this file" }, 403);
    }

    // Simulate parsing process
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return c.json({
      success: true,
      fileKey,
      status: "parsed",
      username: pdfAuth.username,
    });
  } catch (error) {
    console.error("Error ingesting PDF:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Get Files Route
app.get("/pdf/files", requirePdfJwt, async (c) => {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: needed for framework compatibility
    const pdfAuth = (c as any).pdfAuth;

    // List files from R2 bucket for this user
    const prefix = `uploads/${pdfAuth.username}/`;
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
app.post("/pdf/update-metadata", requirePdfJwt, async (c) => {
  try {
    const { fileKey, metadata } = await c.req.json();
    // biome-ignore lint/suspicious/noExplicitAny: needed for framework compatibility
    const pdfAuth = (c as any).pdfAuth;

    if (!fileKey || !metadata) {
      return c.json({ error: "fileKey and metadata are required" }, 400);
    }

    // Verify the fileKey belongs to the authenticated user
    if (!fileKey.startsWith(`uploads/${pdfAuth.username}/`)) {
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
      username: pdfAuth.username,
    });
  } catch (error) {
    console.error("Error updating metadata:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PDF Stats Route
app.get("/pdf/stats", requirePdfJwt, async (c) => {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: needed for framework compatibility
    const pdfAuth = (c as any).pdfAuth;

    // Get stats for this user's files
    const prefix = `uploads/${pdfAuth.username}/`;
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
      username: pdfAuth.username,
      totalFiles,
      filesByStatus,
    });
  } catch (error) {
    console.error("Error getting stats:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Add campaign endpoints
app.get("/api/campaigns", async (c) => {
  console.log("GET /api/campaigns");
  try {
    const userId = await getUserIdFromJwt(c);
    if (!userId) {
      return c.json({ error: "Missing or invalid Authorization token" }, 401);
    }
    console.log("[API] GET /api/campaigns for userId:", userId);
    const id = c.env.CampaignManager.idFromName(userId);
    const stub = c.env.CampaignManager.get(id);
    const resp = await stub.fetch("https://dummy/campaigns");
    console.log("[API] DO fetch status:", resp.status);
    if (!resp.ok) {
      const text = await resp.text();
      console.error("[API] Error from DO:", resp.status, text);
      return c.json(
        { error: `Failed to fetch campaigns: ${resp.status}` },
        500
      );
    }
    const data = (await resp.json()) as { campaigns?: unknown[] };
    console.log("[API] Campaigns response:", data);
    return c.json({ campaigns: data.campaigns || [] });
  } catch (error) {
    console.error("[API] Exception in GET /api/campaigns:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

app.post("/api/campaigns", async (c) => {
  try {
    const userId = await getUserIdFromJwt(c);
    if (!userId) {
      return c.json({ error: "Missing or invalid Authorization token" }, 401);
    }
    console.log("[API] POST /api/campaigns for userId:", userId);
    const id = c.env.CampaignManager.idFromName(userId);
    const stub = c.env.CampaignManager.get(id);
    const body = await c.req.json();
    console.log("[API] Creating campaign with body:", body);
    const resp = await stub.fetch("https://dummy/campaigns", {
      method: "POST",
      body: JSON.stringify(body),
    });
    console.log("[API] DO fetch status:", resp.status);
    if (!resp.ok) {
      const text = await resp.text();
      console.error("[API] Error from DO:", resp.status, text);
      return c.json(
        { error: `Failed to create campaign: ${resp.status}` },
        500
      );
    }
    const data = (await resp.json()) as { campaign?: unknown };
    console.log("[API] Created campaign response:", data);
    return c.json({ campaign: data.campaign });
  } catch (error) {
    console.error("[API] Exception in POST /api/campaigns:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

app.all("*", async (c) => {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
    );
  }
  return (
    (await routeAgentRequest(c.req.raw, c.env)) ||
    new Response("Not found", { status: 404 })
  );
});

export default app;
