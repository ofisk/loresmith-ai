import { openai } from "@ai-sdk/openai";
import { routeAgentRequest, type Schedule } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import { unstable_getSchedulePrompt } from "agents/schedule";
import {
  createDataStreamResponse,
  generateId,
  type StreamTextOnFinishCallback,
  streamText,
  type ToolSet,
} from "ai";
import type { Context } from "hono";
import { Hono } from "hono";
import { type JWTPayload, jwtVerify, SignJWT } from "jose";
import campaignAgent from "./agents/campaign";
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
  if (!secret) {
    throw new Error("ADMIN_SECRET not configured");
  }
  return new TextEncoder().encode(secret);
}

// Helper to set PDF auth context
function setPdfAuth(c: Context, payload: PdfAuthPayload) {
  (c as any).pdfAuth = payload;
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
  } catch (_err) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}

const model = openai("gpt-4o-mini");

console.log("Server file loaded and running");

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
    _options?: { abortSignal?: AbortSignal }
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
              toolName === "getPdfStats" ||
              toolName === "listCampaigns" ||
              toolName === "createCampaign"
            ) {
              return [
                toolName,
                {
                  ...tool,
                  execute: async (args: any, context: any) => {
                    // For PDF and campaign tools, ensure JWT is always included
                    const enhancedArgs = { ...args, jwt: clientJwt };
                    console.log(
                      `[Agent] Calling tool ${toolName} with args:`,
                      enhancedArgs
                    );
                    return tool.execute?.(enhancedArgs, context);
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

**Campaign Listing Flow:**
- If the user asks to see all campaigns, call the listCampaigns tool.
- If campaigns exist, display the list to the user.
- If no campaigns exist, prompt the user to create a new campaign and show the campaign creation UI.
- Never ask for a campaign ID if the user just wants to see all campaigns.

**Example:**
- User: "Do I have any campaigns?" or "List all my campaigns."
- You: Call listCampaigns tool.
- If result is not empty: "Here are your campaigns: [list]."
- If result is empty: "You don't have any campaigns yet. Please create one to get started." (Show campaign creation UI)

**Campaign Creation Flow:**
- When the user wants to create a new campaign:
  - First, invoke the createCampaign tool (with a name if provided, or let the user fill it in).
  - Wait for the campaign to be created and get the campaignId from the result.
  - The createCampaign tool returns an object with a "campaign" field, which contains a "campaignId" (e.g., { campaign: { campaignId: "abc123", ... } }).
  - After calling createCampaign, always extract the campaignId from the result and use it as the argument for listCampaignResources (e.g., { campaignId: "abc123" }).
  - Never call listCampaignResources with an empty or missing campaignId.

**Example createCampaign result:**
    {
      "campaign": {
        "campaignId": "abc123",
        "name": "Historica Arcanum"
      }
    }

**Example Flow:**
- User: "Create a new campaign called Historica Arcanum."
- You: Call createCampaign tool with name="Historica Arcanum"
- You: After creation, call listCampaignResources tool with campaignId set to the new campaign's ID

**Campaign Resource Listing Flow:**
- If the user asks to list resources for a campaign, always require a campaignId.
- If the campaignId is not provided, prompt the user to select or create a campaign first.
- Never call listCampaignResources with an empty or missing campaignId.

**Example:**
- User: "Show me the resources for my campaign."
- You: "Which campaign? Please select or create a campaign first."
- (After campaign is selected or created)
- You: Call listCampaignResources tool with campaignId set to the selected campaign's ID.

**Other Operations:**
- Use listPdfFiles to show uploaded files (JWT will be automatically included)
- Use getPdfStats for upload statistics (JWT will be automatically included)
- Use generatePdfUploadUrl to create upload URLs for new files
- Use updatePdfMetadata to add descriptions and tags to uploaded files
- Use ingestPdfFile to process uploaded PDFs

Always use the appropriate tools for operations and guide users through the process step by step.
`,
          messages: processedMessages,
          tools: enhancedTools,
          onFinish: async (args) => {
            (onFinish ?? (() => {}))(
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
        if (
          result &&
          typeof (
            result as { mergeIntoDataStream?: (dataStream: unknown) => void }
          ).mergeIntoDataStream === "function"
        ) {
          (
            result as { mergeIntoDataStream: (dataStream: unknown) => void }
          ).mergeIntoDataStream(dataStream);
        }
      },
    });

    return dataStreamResponse;
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
