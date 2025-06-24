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

🔐 IMPORTANT: When a user starts a session, prompt them with:
"Please paste your admin key to enable upload and parsing features."

If they provide an admin key, immediately call the setAdminSecret tool to validate it.
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

// Export the SessionFileTracker Durable Object
export { SessionFileTracker } from "./durable-objects/SessionFileTracker";

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

// PDF Authentication Route
app.post("/pdf/authenticate", async (c) => {
  try {
    const { sessionId, providedKey } = await c.req.json();
    
    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }

    // Get the SessionFileTracker Durable Object for this session
    const sessionIdObj = c.env.SessionFileTracker.idFromName(sessionId);
    const sessionTracker = c.env.SessionFileTracker.get(sessionIdObj);
    
    // Check if this is a status check request
    if (providedKey === "check-status-only") {
      const authCheckResponse = await sessionTracker.fetch("https://dummy-host/is-session-authenticated", {
        method: "GET"
      });
      
      const authCheck = await authCheckResponse.json() as { authenticated: boolean };
      
      return c.json({ 
        success: true, 
        authenticated: authCheck.authenticated
      });
    }
    
    // Regular authentication flow
    if (!providedKey) {
      return c.json({ error: "providedKey is required" }, 400);
    }

    const expectedKey = c.env.ADMIN_SECRET; // Use the environment variable from Cloudflare
    
    // Send validation request to the Durable Object
    const authResponse = await sessionTracker.fetch("https://dummy-host/validate-session-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, providedKey, expectedKey })
    });

    const authResult = await authResponse.json() as { success: boolean; authenticated: boolean; authenticatedAt?: string; error?: string };
    
    if (authResult.success && authResult.authenticated) {
      return c.json({ 
        success: true, 
        authenticated: true,
        authenticatedAt: authResult.authenticatedAt
      });
    } else {
      return c.json({ 
        success: false, 
        authenticated: false,
        error: "Invalid admin key"
      }, 401);
    }

  } catch (error) {
    console.error("Error authenticating session:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PDF Upload URL Route
app.post("/pdf/upload-url", async (c) => {
  try {
    const { sessionId, fileName } = await c.req.json();
    
    if (!sessionId || !fileName) {
      return c.json({ error: "sessionId and fileName are required" }, 400);
    }

    // Check if session is authenticated
    const sessionIdObj = c.env.SessionFileTracker.idFromName(sessionId);
    const sessionTracker = c.env.SessionFileTracker.get(sessionIdObj);
    
    const authCheckResponse = await sessionTracker.fetch("https://dummy-host/is-session-authenticated", {
      method: "GET"
    });
    
    const authCheck = await authCheckResponse.json() as { authenticated: boolean };
    if (!authCheck.authenticated) {
      return c.json({ error: "Session not authenticated" }, 401);
    }

    // Generate unique file key
    const fileKey = `uploads/${sessionId}/${crypto.randomUUID()}-${fileName}`;
    
    // For now, return a direct upload URL (in production, use presigned URLs)
    const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/storage/buckets/loresmith-pdfs/objects/${fileKey}`;

    // Add file metadata to SessionFileTracker
    await sessionTracker.fetch("https://dummy-host/add-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        fileKey,
        fileName,
        fileSize: 0, // Will be updated after upload
        metadata: { status: "uploading" }
      })
    });

    return c.json({
      uploadUrl,
      fileKey,
      sessionId
    });

  } catch (error) {
    console.error("Error generating upload URL:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PDF Ingest Route
app.post("/pdf/ingest", async (c) => {
  try {
    const { sessionId, fileKey } = await c.req.json();
    
    if (!sessionId || !fileKey) {
      return c.json({ error: "sessionId and fileKey are required" }, 400);
    }

    // Check if session is authenticated
    const sessionIdObj = c.env.SessionFileTracker.idFromName(sessionId);
    const sessionTracker = c.env.SessionFileTracker.get(sessionIdObj);
    
    const authCheckResponse = await sessionTracker.fetch("https://dummy-host/is-session-authenticated", {
      method: "GET"
    });
    
    const authCheck = await authCheckResponse.json() as { authenticated: boolean };
    if (!authCheck.authenticated) {
      return c.json({ error: "Session not authenticated" }, 401);
    }

    // Update status to parsing
    await sessionTracker.fetch("https://dummy-host/update-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileKey,
        status: "parsing"
      })
    });

    // Simulate parsing process
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Update status to parsed
    await sessionTracker.fetch("https://dummy-host/update-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileKey,
        status: "parsed"
      })
    });

    return c.json({
      success: true,
      fileKey,
      status: "parsed"
    });

  } catch (error) {
    console.error("Error ingesting PDF:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Get Files Route
app.get("/pdf/files", async (c) => {
  try {
    const sessionId = c.req.query("sessionId");
    
    if (!sessionId) {
      return c.json({ error: "sessionId query parameter is required" }, 400);
    }

    const sessionIdObj = c.env.SessionFileTracker.idFromName(sessionId);
    const sessionTracker = c.env.SessionFileTracker.get(sessionIdObj);
    
    const filesResponse = await sessionTracker.fetch(`https://dummy-host/get-files?sessionId=${sessionId}`, {
      method: "GET"
    });
    
    const files = await filesResponse.json() as { files: any[] };
    
    return c.json(files);

  } catch (error) {
    console.error("Error getting files:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PDF Update Metadata Route
app.post("/pdf/update-metadata", async (c) => {
  try {
    const { sessionId, fileKey, metadata } = await c.req.json();
    
    if (!sessionId || !fileKey || !metadata) {
      return c.json({ error: "sessionId, fileKey, and metadata are required" }, 400);
    }

    // Check if session is authenticated
    const sessionIdObj = c.env.SessionFileTracker.idFromName(sessionId);
    const sessionTracker = c.env.SessionFileTracker.get(sessionIdObj);
    
    const authCheckResponse = await sessionTracker.fetch("https://dummy-host/is-session-authenticated", {
      method: "GET"
    });
    
    const authCheck = await authCheckResponse.json() as { authenticated: boolean };
    if (!authCheck.authenticated) {
      return c.json({ error: "Session not authenticated" }, 401);
    }

    // Update file metadata in SessionFileTracker
    await sessionTracker.fetch("https://dummy-host/update-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileKey,
        metadata
      })
    });

    return c.json({
      success: true,
      fileKey
    });

  } catch (error) {
    console.error("Error updating metadata:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PDF Stats Route
app.get("/pdf/stats", async (c) => {
  try {
    // This would require aggregating data from all sessions
    // For now, return basic stats structure
    return c.json({
      totalSessions: 0,
      totalFiles: 0,
      filesByStatus: {
        uploading: 0,
        uploaded: 0,
        parsing: 0,
        parsed: 0,
        error: 0
      }
    });

  } catch (error) {
    console.error("Error getting stats:", error);
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
