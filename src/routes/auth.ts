import type { Context } from "hono";
import { jwtVerify } from "jose";
import { getDAOFactory } from "@/dao";
import { AgentRouter } from "@/lib/agent-router";
import { getAuthService, LibraryRAGService } from "@/lib/service-factory";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { AuthService } from "@/services/core/auth-service";

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
    const authService = getAuthService(c.env);
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

  // Create LibraryRAGService if we have a username
  let ragService = null;
  if (username) {
    try {
      ragService = new LibraryRAGService(env);
    } catch (error) {
      console.warn("Failed to initialize LibraryRAGService:", error);
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
  console.log("[handleAuthenticate] Authentication endpoint called - START");
  console.log("[handleAuthenticate] Request URL:", c.req.url);
  console.log("[handleAuthenticate] Request method:", c.req.method);
  try {
    const { username, openaiApiKey, adminSecret } = await c.req.json();
    const sessionId = c.req.header("X-Session-ID") || "default";

    console.log("[auth/authenticate] Request received:", {
      username,
      adminSecret: adminSecret
        ? `${adminSecret.substring(0, 10)}...`
        : "undefined",
    });

    const authService = getAuthService(c.env);
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

    const daoFactory = getDAOFactory(c.env);
    await daoFactory.storeOpenAIKey(username, openaiApiKey);

    console.log("[handleAuthenticate] OpenAI API key stored in database");

    // Also store OpenAI API key in Chat durable object for this session
    console.log(
      "[handleAuthenticate] Storing OpenAI API key in Chat durable object for session:",
      sessionId
    );

    try {
      console.log(
        "[handleAuthenticate] Getting Chat durable object for session:",
        sessionId
      );
      const chatId = c.env.CHAT.idFromName(sessionId);
      const chat = c.env.CHAT.get(chatId);

      // Set the API key directly in the Chat durable object
      const chatRequestUrl = new URL(c.req.url);
      chatRequestUrl.pathname = "/set-user-openai-key";

      console.log(
        "[handleAuthenticate] Calling Chat durable object set-user-openai-key endpoint"
      );

      const response = await chat.fetch(
        new Request(chatRequestUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${result.token}`, // Use the JWT token we just created
          },
          body: JSON.stringify({ openaiApiKey: openaiApiKey.trim() }),
        })
      );

      if (!response.ok) {
        const error = await response.text();
        console.error(
          "[handleAuthenticate] Failed to store OpenAI API key in Chat durable object:",
          {
            status: response.status,
            statusText: response.statusText,
            error,
            sessionId,
          }
        );
        // Don't fail authentication if Chat storage fails - database storage is sufficient
      } else {
        const responseData = await response.json();
        console.log(
          "[handleAuthenticate] OpenAI API key stored in Chat durable object:",
          {
            sessionId,
            response: responseData,
          }
        );
      }
    } catch (error) {
      console.error(
        "[handleAuthenticate] Error storing OpenAI API key in Chat durable object:",
        error
      );
      // Don't fail authentication if Chat storage fails - database storage is sufficient
    }

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

    const daoFactory = getDAOFactory(c.env);
    const apiKey = await daoFactory.getOpenAIKey(username);

    const responseBody = apiKey ? { hasKey: true, apiKey } : { hasKey: false };

    // Allow brief client-side reuse to reduce duplicate requests
    const res = c.json(responseBody);
    res.headers.set("Cache-Control", "private, max-age=300");
    return res;
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

    const daoFactory = getDAOFactory(c.env);
    await daoFactory.storeOpenAIKey(username, apiKey);

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

    const daoFactory = getDAOFactory(c.env);
    await daoFactory.deleteOpenAIKey(username);

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
      `select api_key from user_openai_keys where username = ?`
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
    const chatId = c.env.CHAT.idFromName(sessionId);
    const chat = c.env.CHAT.get(chatId);

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

/**
 * Check if user has OpenAI key stored in database
 *
 * This endpoint checks if a user has a stored OpenAI API key in the database.
 * Used by the client to determine if the user needs to provide an API key during authentication.
 *
 * @see docs/AUTHENTICATION_FLOW.md for complete authentication flow documentation
 */
export async function handleCheckUserOpenAIKey(c: Context<{ Bindings: Env }>) {
  try {
    const username = c.req.query("username");
    if (!username) {
      return c.json({ error: "Username is required" }, 400);
    }

    const daoFactory = getDAOFactory(c.env);
    const hasKey = await daoFactory.hasOpenAIKey(username);

    return c.json({
      success: true,
      hasUserStoredKey: hasKey,
    });
  } catch (error) {
    console.error("Error checking user OpenAI key:", error);
    return c.json({ success: false, hasUserStoredKey: false });
  }
}

/**
 * Logout endpoint - initiates client-side token cleanup
 *
 * This endpoint returns success to indicate logout was initiated server-side.
 * The client is responsible for clearing the JWT token from localStorage.
 * The client should call AuthService.clearJwt() to remove the token and dispatch
 * the jwt-changed event to notify other components.
 *
 * @see docs/AUTHENTICATION_FLOW.md for complete authentication flow documentation
 */
export async function handleLogout(c: Context<{ Bindings: Env }>) {
  try {
    // This endpoint just returns success - the client should clear local storage
    return c.json({
      success: true,
      message: "Logout successful. Please clear your browser's local storage.",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
