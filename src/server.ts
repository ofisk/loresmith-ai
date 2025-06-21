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
import { cors } from "hono/cors";
import { pdfRoutes } from "./routes/pdf-routes";
import { executions, tools } from "./tools";
import { processToolCalls } from "./utils";
// import { env } from "cloudflare:workers";

/**
 * PDF Upload Architecture
 *
 * This application uses a hybrid approach for PDF uploads:
 *
 * 1. DIRECT API ENDPOINTS (Primary method for UI uploads)
 *    - Purpose: User-initiated uploads from the frontend
 *    - Performance: Fast, direct server-to-R2 communication
 *    - Benefits: No agent overhead, immediate feedback, real-time progress
 *    - Endpoints: /api/generate-upload-url, /api/upload-pdf, /api/upload-pdf-direct
 *
 * 2. AGENT TOOLS (Secondary method for AI-driven operations)
 *    - Purpose: AI-initiated uploads and complex operations
 *    - Context: Run within agent environment with full database access
 *    - Benefits: Context awareness, integration with AI workflows
 *    - Tools: generatePdfUploadUrl, uploadPdfFile, confirmPdfUpload
 *
 * Why this hybrid approach?
 * - UI uploads need speed and reliability (direct APIs)
 * - AI operations need context and intelligence (agent tools)
 * - Both systems can coexist and complement each other
 *
 * File size handling:
 * - Small files (< 50MB): Base64 upload via /api/upload-pdf-direct
 * - Large files (≥ 50MB): Presigned URL via /api/generate-upload-url
 */

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

// Mount PDF routes
app.route("/", pdfRoutes);

export default app;
