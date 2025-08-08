import type { Context } from "hono";
import { jwtVerify } from "jose";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import { AuthService } from "../services/auth-service";

// Helper to set user auth context
export function setUserAuth(c: Context, payload: AuthPayload) {
  (c as any).userAuth = payload;
}

// Middleware to require JWT for mutating endpoints
export async function requireUserJwt(
  c: Context,
  next: () => Promise<void>
): Promise<Response | undefined> {
  const authHeader = c.req.header("Authorization");
  console.log(
    "[requireUserJwt] Auth header:",
    authHeader ? `${authHeader.substring(0, 20)}...` : "undefined"
  );

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("[requireUserJwt] Missing or invalid Authorization header");
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7);
  console.log(
    "[requireUserJwt] Token:",
    token ? `${token.substring(0, 20)}...` : "undefined"
  );

  try {
    const authService = new AuthService(c.env);
    const jwtSecret = await authService.getJwtSecret();
    console.log("[requireUserJwt] JWT secret length:", jwtSecret.length);

    const { payload } = await jwtVerify(token, jwtSecret);
    console.log("[requireUserJwt] JWT payload:", payload);

    if (!payload || payload.type !== "user-auth") {
      console.log("[requireUserJwt] Invalid token payload:", payload);
      return c.json({ error: "Invalid token" }, 401);
    }

    // Attach user info to context
    setUserAuth(c, payload as AuthPayload);
    console.log("[requireUserJwt] User auth set:", payload);
    await next();
  } catch (err) {
    console.error("[requireUserJwt] JWT verification error:", err);
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}

// Agent routing functionality
export async function determineAgent(
  userMessage: string,
  messages: any[],
  env: any
): Promise<string> {
  // Get recent context for better routing
  const recentMessages = messages.slice(-6); // Last 6 messages
  const recentContext = recentMessages.map((msg) => msg.content).join(" ");

  // Get username from JWT for RAG service
  const lastUserMessage = messages
    .slice()
    .reverse()
    .find((msg) => msg.role === "user");

  const username = lastUserMessage
    ? AuthService.extractUsernameFromMessage(lastUserMessage)
    : null;

  const { AgentRouter } = await import("../services/agent-router");

  // Create RAG service if we have a username
  let ragService = null;
  if (username) {
    try {
      const { AutoRAGService } = await import("../services/autorag-service");
      ragService = new AutoRAGService(env.DB, env.AUTORAG);
    } catch (error) {
      console.warn("Failed to initialize AutoRAG service:", error);
    }
  }

  const intent = await AgentRouter.routeMessage(
    userMessage,
    recentContext,
    ragService,
    null // We don't have the model here, so it will create a new one
  );

  console.log(
    `[AgentRouter] Routing to ${intent.agent} (confidence: ${intent.confidence}) - ${intent.reason}`
  );

  return intent.agent;
}

// User Authentication Route (returns JWT)
export async function handleAuthenticate(c: Context<{ Bindings: Env }>) {
  try {
    const { username, openaiApiKey, adminSecret } = await c.req.json();
    const sessionId = c.req.header("X-Session-ID") || "default";

    console.log(
      "[auth/authenticate] Server environment:",
      JSON.stringify(process.env, null, 2)
    );
    console.log("[auth/authenticate] c.env:", JSON.stringify(c.env, null, 2));

    console.log("[auth/authenticate] Request received:", {
      username,
      adminSecret: adminSecret
        ? `${adminSecret.substring(0, 10)}...`
        : "undefined",
    });

    const authService = new AuthService(c.env);
    const result = await authService.authenticateUser({
      username,
      openaiApiKey,
      adminSecret,
      sessionId,
    });

    if (!result.success) {
      console.log("[auth/authenticate] Authentication failed:", result.error);
      return c.json({ error: result.error }, 401);
    }

    console.log("[auth/authenticate] Authentication successful");

    // Store OpenAI API key in database
    console.log(
      "[handleAuthenticate] Storing OpenAI API key in database for user:",
      username
    );
    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO user_openai_keys (username, api_key, updated_at) 
       VALUES (?, ?, CURRENT_TIMESTAMP)`
    )
      .bind(username, openaiApiKey)
      .run();

    console.log("[handleAuthenticate] OpenAI API key stored successfully");

    return c.json({
      token: result.token,
    });
  } catch (error) {
    console.error("Authentication error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get stored OpenAI key for user
export async function handleGetOpenAIKey(c: Context<{ Bindings: Env }>) {
  try {
    const username = c.req.query("username");
    if (!username) {
      return c.json({ error: "Username is required" }, 400);
    }

    const result = await c.env.DB.prepare(
      "SELECT api_key FROM user_openai_keys WHERE username = ?"
    )
      .bind(username)
      .first<{ api_key: string }>();

    if (result) {
      return c.json({
        hasKey: true,
        apiKey: result.api_key,
      });
    } else {
      return c.json({
        hasKey: false,
      });
    }
  } catch (error) {
    console.error("Error getting OpenAI key:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Store OpenAI key for user
export async function handleStoreOpenAIKey(c: Context<{ Bindings: Env }>) {
  try {
    const { username, apiKey } = await c.req.json();

    if (!username || !apiKey) {
      return c.json({ error: "Username and API key are required" }, 400);
    }

    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO user_openai_keys (username, api_key, updated_at) 
       VALUES (?, ?, CURRENT_TIMESTAMP)`
    )
      .bind(username, apiKey)
      .run();

    return c.json({
      success: true,
      message: "OpenAI API key stored successfully",
    });
  } catch (error) {
    console.error("Error storing OpenAI key:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Delete OpenAI key for user
export async function handleDeleteOpenAIKey(c: Context<{ Bindings: Env }>) {
  try {
    const { username } = await c.req.json();

    if (!username) {
      return c.json({ error: "Username is required" }, 400);
    }

    await c.env.DB.prepare("DELETE FROM user_openai_keys WHERE username = ?")
      .bind(username)
      .run();

    return c.json({
      success: true,
      message: "OpenAI API key deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting OpenAI key:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Check if OpenAI key is required for user
export async function handleCheckOpenAIKey(c: Context<{ Bindings: Env }>) {
  try {
    const username = c.req.query("username");

    // If no username is provided, it means no default key is configured
    // and the user will need to provide their own key
    if (!username) {
      return c.json({
        success: false,
        hasKey: false,
        requiresUserKey: true,
      });
    }

    // Get the API key from D1 database
    const result = await c.env.DB.prepare(
      `SELECT api_key FROM user_openai_keys WHERE username = ?`
    )
      .bind(username)
      .first();

    return c.json({
      success: true,
      hasKey: !!result?.api_key,
      requiresUserKey: !result?.api_key,
    });
  } catch (error) {
    console.error("Error checking OpenAI key:", error);
    return c.json(
      {
        success: false,
        error: "Failed to check OpenAI key",
      },
      500
    );
  }
}

// Set user's OpenAI API key in Chat durable object
export async function handleSetOpenAIApiKey(c: Context<{ Bindings: Env }>) {
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

    // Set the API key directly in the Chat durable object
    const response = await chat.fetch(
      new Request(`${new URL(c.req.url).origin}/set-user-openai-key`, {
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
}

// Check if user has OpenAI key in session
export async function handleCheckUserOpenAIKey(c: Context<{ Bindings: Env }>) {
  try {
    // Check if the user has a stored API key in the durable object
    // For now, we'll assume they don't have one since the durable object
    // doesn't expose this information through its fetch method
    return c.json({ success: false, hasUserStoredKey: false });
  } catch (error) {
    console.error("Error checking user OpenAI key:", error);
    return c.json({ success: false, hasUserStoredKey: false });
  }
}
