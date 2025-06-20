import { routeAgentRequest, type Schedule } from "agents";

import { unstable_getSchedulePrompt } from "agents/schedule";

import { AIChatAgent } from "agents/ai-chat-agent";
import {
  createDataStreamResponse,
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { processToolCalls } from "./utils";
import { tools, executions } from "./tools";
// import { env } from "cloudflare:workers";

const model = openai("gpt-4o-2024-11-20");
// Cloudflare AI Gateway
// const openai = createOpenAI({
//   apiKey: env.OPENAI_API_KEY,
//   baseURL: env.GATEWAY_BASE_URL,
// });

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   * @param onFinish - Callback function executed when streaming completes
   */

  async onChatMessage(onFinish: StreamTextOnFinishCallback<ToolSet>) {
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
        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: this.messages,
          dataStream,
          tools: allTools,
          executions,
        });

        // Stream the AI response using GPT-4
        const result = streamText({
          model,
          system: `You are a helpful assistant that can do various tasks... 

${unstable_getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.
`,
          messages: processedMessages,
          tools: allTools,
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

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
const app = new Hono<{ Bindings: Env }>();

// Add CORS middleware
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowedOrigins =
        process.env.CORS_ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) || [];
      return allowedOrigins.includes(origin || "") || !origin ? origin : null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/check-open-ai-key", (c) => {
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  return c.json({ success: hasOpenAIKey });
});

// Direct PDF upload endpoint
app.post("/api/upload-pdf", async (c) => {
  try {
    const { key, uploadId } = c.req.query();
    const adminSecret = c.req.header("X-Admin-Secret");
    
    if (!key || !uploadId) {
      return c.json({ error: "Missing key or uploadId parameter" }, 400);
    }

    if (!adminSecret) {
      return c.json({ error: "Missing admin secret" }, 401);
    }

    // Verify admin secret
    if (adminSecret !== c.env.PDF_ADMIN_SECRET) {
      return c.json({ error: "Unauthorized. Invalid admin secret." }, 401);
    }

    // Get the file from the request body
    const formData = await c.req.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return c.json({ error: "File must be a PDF" }, 400);
    }

    // Check file size
    if (file.size > 200 * 1024 * 1024) { // 200MB limit
      return c.json({ error: "File size exceeds 200MB limit" }, 400);
    }

    // Upload to R2
    const arrayBuffer = await file.arrayBuffer();
    await c.env.PDF_BUCKET.put(key, arrayBuffer, {
      httpMetadata: {
        contentType: "application/pdf",
        contentDisposition: `attachment; filename="${file.name}"`,
      },
      customMetadata: {
        originalFilename: file.name,
        uploadDate: new Date().toISOString(),
        uploadId,
      },
    });

    return c.json({ 
      success: true, 
      message: `File "${file.name}" uploaded successfully`,
      key,
      uploadId 
    });
  } catch (error) {
    console.error("Upload error:", error);
    return c.json({ 
      error: "Upload failed", 
      details: error instanceof Error ? error.message : "Unknown error" 
    }, 500);
  }
});

app.all("*", async (c) => {
  console.log(`Incoming request: ${c.req.method} ${c.req.url}`);

  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
    );
  }

  const result = await routeAgentRequest(c.req.raw, c.env);
  if (result) {
    console.log("routeAgentRequest handled the request");
    return result;
  }
  console.log("routeAgentRequest did not handle the request, returning 404");
  return new Response("Not found", { status: 404 });
});

export default app;
