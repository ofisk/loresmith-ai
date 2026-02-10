import type { Context } from "hono";
import { jwtVerify } from "jose";
import { getDAOFactory } from "@/dao";
import { EmailService } from "@/services/core/email-service";
import { getEnvVar } from "@/lib/env-utils";
import { hashPassword, verifyPassword } from "@/lib/password";
import { AgentRouter } from "@/lib/agent-router";
import { getAuthService, LibraryRAGService } from "@/lib/service-factory";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { AuthService } from "@/services/core/auth-service";
import { extractJwtFromHeader } from "@/lib/auth-utils";
import {
  API_CONFIG,
  ALLOWED_RETURN_ORIGINS,
  DEFAULT_APP_ORIGIN,
  GOOGLE_OAUTH_URLS,
} from "@/shared-config";

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

  const token = extractJwtFromHeader(authHeader);
  if (!token) {
    console.log("[requireUserJwt] Missing or invalid Authorization header");
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }
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

    // Store OpenAI API key in database (if provided)
    if (openaiApiKey && openaiApiKey.trim() !== "") {
      console.log(
        "[handleAuthenticate] Storing OpenAI API key in database for user:",
        username
      );

      const daoFactory = getDAOFactory(c.env);
      await daoFactory.storeOpenAIKey(username, openaiApiKey);

      console.log("[handleAuthenticate] OpenAI API key stored in database");
    } else {
      console.log(
        "[handleAuthenticate] No OpenAI API key provided - skipping storage"
      );
    }

    // Also store OpenAI API key in Chat durable object for this session (if provided)
    if (openaiApiKey && openaiApiKey.trim() !== "") {
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
    } else {
      console.log(
        "[handleAuthenticate] No OpenAI API key provided - skipping Chat durable object storage"
      );
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

// --- Google OAuth ---

function isAllowedReturnUrl(returnUrl: string, appOrigin?: string): boolean {
  try {
    const origin = new URL(returnUrl).origin;
    if (ALLOWED_RETURN_ORIGINS.includes(origin)) return true;
    if (appOrigin && origin === new URL(appOrigin).origin) return true;
    return false;
  } catch {
    return false;
  }
}

export async function handleGoogleAuth(c: Context<{ Bindings: Env }>) {
  try {
    const returnUrl =
      c.req.query("return_url") || (c.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN);
    if (!isAllowedReturnUrl(returnUrl, c.env.APP_ORIGIN)) {
      return c.json({ error: "Invalid return URL" }, 400);
    }
    const clientId = await getEnvVar(c.env, "GOOGLE_OAUTH_CLIENT_ID", false);
    if (!clientId) {
      return c.json({ error: "Google sign-in is not configured" }, 503);
    }
    const callbackUrl = new URL(
      API_CONFIG.ENDPOINTS.AUTH.GOOGLE_CALLBACK,
      c.req.url
    ).toString();
    const nonce = crypto.randomUUID();
    const state = `${nonce}.${encodeURIComponent(returnUrl)}`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: "code",
      scope: "openid email profile",
      state,
    });
    return c.redirect(`${GOOGLE_OAUTH_URLS.AUTH}?${params.toString()}`);
  } catch (error) {
    console.error("Google auth error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function handleGoogleCallback(c: Context<{ Bindings: Env }>) {
  try {
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) {
      return c.redirect(
        `${c.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN}#error=missing_params`
      );
    }
    let returnUrl: string;
    try {
      const dot = state.indexOf(".");
      const url = dot >= 0 ? decodeURIComponent(state.slice(dot + 1)) : "";
      returnUrl = url || (c.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN);
    } catch {
      returnUrl = c.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN;
    }
    if (!isAllowedReturnUrl(returnUrl, c.env.APP_ORIGIN)) {
      returnUrl = c.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN;
    }
    const clientId = await getEnvVar(c.env, "GOOGLE_OAUTH_CLIENT_ID", false);
    const clientSecret = await getEnvVar(
      c.env,
      "GOOGLE_OAUTH_CLIENT_SECRET",
      false
    );
    if (!clientId || !clientSecret) {
      return c.redirect(`${returnUrl}#error=oauth_not_configured`);
    }
    const callbackUrl = new URL(
      API_CONFIG.ENDPOINTS.AUTH.GOOGLE_CALLBACK,
      c.req.url
    ).toString();
    const tokenRes = await fetch(GOOGLE_OAUTH_URLS.TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Google token exchange failed:", err);
      return c.redirect(`${returnUrl}#error=token_exchange_failed`);
    }
    const tokenJson = (await tokenRes.json()) as {
      id_token?: string;
      access_token?: string;
    };
    const userRes = await fetch(GOOGLE_OAUTH_URLS.USERINFO, {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token ?? ""}`,
      },
    });
    if (!userRes.ok) {
      return c.redirect(`${returnUrl}#error=userinfo_failed`);
    }
    const userInfo = (await userRes.json()) as {
      id?: string;
      email?: string;
      name?: string;
    };
    const googleEmail = userInfo.email?.trim();
    const googleSub = userInfo.id ?? crypto.randomUUID();

    const dao = getDAOFactory(c.env);
    const claimedUsername =
      googleEmail != null
        ? await dao.authUserDAO.getClaimedUsernameByGoogleEmail(googleEmail)
        : null;

    if (claimedUsername) {
      const claimedUser =
        await dao.authUserDAO.getUserByUsername(claimedUsername);
      const authService = getAuthService(c.env);
      const result = await authService.authenticateUser({
        username: claimedUsername,
        openaiApiKey: undefined,
        adminSecret: undefined,
        isAdmin: !!claimedUser?.is_admin,
      });
      if (!result.success || !result.token) {
        return c.redirect(`${returnUrl}#error=auth_failed`);
      }
      return c.redirect(
        `${returnUrl}#token=${encodeURIComponent(result.token)}`
      );
    }

    // Existing Google user who already chose a username: log in directly
    if (googleEmail) {
      const existingUser = await dao.authUserDAO.getUserByEmail(googleEmail);
      if (existingUser && existingUser.auth_provider === "google") {
        const authService = getAuthService(c.env);
        const result = await authService.authenticateUser({
          username: existingUser.username,
          openaiApiKey: undefined,
          adminSecret: undefined,
          isAdmin: !!existingUser.is_admin,
        });
        if (result.success && result.token) {
          return c.redirect(
            `${returnUrl}#token=${encodeURIComponent(result.token)}`
          );
        }
      }
    }

    if (!googleEmail) {
      return c.redirect(`${returnUrl}#error=email_required`);
    }
    const pendingToken = await AuthService.createGooglePendingToken(c.env, {
      email: googleEmail,
      sub: googleSub,
    });
    return c.redirect(
      `${returnUrl}#google_pending=${encodeURIComponent(pendingToken)}`
    );
  } catch (error) {
    console.error("Google callback error:", error);
    const returnUrl = (c.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN) as string;
    return c.redirect(`${returnUrl}#error=internal`);
  }
}

// --- Username/password: register, login, verify, resend ---

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
/** Reserved prefix for OAuth-derived usernames; password users cannot register usernames starting with this */
const OAUTH_USERNAME_PREFIX = "google_";

export async function handleGoogleCompleteSignup(
  c: Context<{ Bindings: Env }>
) {
  try {
    const body = (await c.req.json()) as {
      pendingToken?: string;
      username?: string;
    };
    const { pendingToken, username } = body;
    const trimmedUsername = username?.trim() ?? "";
    if (!pendingToken || !trimmedUsername) {
      return c.json({ error: "Pending token and username are required." }, 400);
    }
    const payload = await AuthService.verifyGooglePendingToken(
      c.env,
      pendingToken
    );
    if (!payload) {
      return c.json(
        {
          error:
            "Invalid or expired sign-in link. Please sign in with Google again.",
        },
        400
      );
    }
    if (
      !USERNAME_REGEX.test(trimmedUsername) ||
      trimmedUsername.toLowerCase().startsWith(OAUTH_USERNAME_PREFIX)
    ) {
      return c.json(
        {
          error:
            "Username must be 2–64 characters (letters, numbers, _ or -) and cannot start with the reserved prefix.",
        },
        400
      );
    }
    const dao = getDAOFactory(c.env);
    const existingByUsername =
      await dao.authUserDAO.getUserByUsername(trimmedUsername);
    const existingByEmail = await dao.authUserDAO.getUserByEmail(payload.email);
    if (existingByUsername) {
      return c.json({ error: "Username is already taken." }, 409);
    }
    if (existingByEmail) {
      return c.json(
        { error: "An account with this email already exists." },
        409
      );
    }
    const id = crypto.randomUUID();
    await dao.authUserDAO.createUser({
      id,
      username: trimmedUsername,
      email: payload.email,
      passwordHash: null,
      authProvider: "google",
      isAdmin: false,
    });
    await dao.authUserDAO.setEmailVerified(trimmedUsername);
    const authService = getAuthService(c.env);
    const result = await authService.authenticateUser({
      username: trimmedUsername,
      openaiApiKey: undefined,
      adminSecret: undefined,
      isAdmin: false,
    });
    if (!result.success || !result.token) {
      return c.json({ error: "Authentication failed." }, 500);
    }
    return c.json({ token: result.token });
  } catch (error) {
    console.error("Google complete signup error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function handleRegister(c: Context<{ Bindings: Env }>) {
  try {
    const body = (await c.req.json()) as {
      username?: string;
      password?: string;
      email?: string;
      openaiApiKey?: string;
    };
    const { username, password, email, openaiApiKey } = body;
    const trimmedUsername = username?.trim() ?? "";
    if (
      !username ||
      !password ||
      !email ||
      !USERNAME_REGEX.test(trimmedUsername) ||
      !EMAIL_REGEX.test(email.trim())
    ) {
      return c.json(
        {
          error:
            "Username (2–64 chars, letters/numbers/_-), email, and password are required.",
        },
        400
      );
    }
    if (trimmedUsername.toLowerCase().startsWith(OAUTH_USERNAME_PREFIX)) {
      return c.json(
        { error: "Username cannot start with the reserved prefix." },
        400
      );
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return c.json(
        {
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        },
        400
      );
    }
    const dao = getDAOFactory(c.env);
    const existingByUsername =
      await dao.authUserDAO.getUserByUsername(trimmedUsername);
    const existingByEmail = await dao.authUserDAO.getUserByEmail(email.trim());
    if (existingByUsername) {
      return c.json({ error: "Username is already taken." }, 409);
    }
    if (existingByEmail) {
      return c.json({ error: "Email is already registered." }, 409);
    }
    const passwordHash = await hashPassword(password);
    const id = crypto.randomUUID();
    await dao.authUserDAO.createUser({
      id,
      username: trimmedUsername,
      email: email.trim().toLowerCase(),
      passwordHash,
      authProvider: "password",
      isAdmin: false,
    });
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await dao.authUserDAO.createVerificationToken(
      token,
      trimmedUsername,
      expiresAt
    );
    if (
      openaiApiKey &&
      typeof openaiApiKey === "string" &&
      openaiApiKey.trim()
    ) {
      await dao.storeOpenAIKey(trimmedUsername, openaiApiKey.trim());
    }
    const apiOrigin = new URL(c.req.url).origin;
    const verificationLink = `${apiOrigin}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const resendKey = await getEnvVar(c.env, "RESEND_API_KEY", false);
    const fromAddress =
      (await getEnvVar(c.env, "VERIFICATION_EMAIL_FROM", false)) ||
      "LoreSmith <noreply@example.com>";
    if (resendKey) {
      const emailService = new EmailService(resendKey);
      const sendResult = await emailService.sendVerificationEmail({
        to: email.trim().toLowerCase(),
        verificationLink,
        fromAddress,
      });
      if (!sendResult.ok) {
        console.error("Failed to send verification email:", sendResult.error);
      }
    }
    return c.json({
      success: true,
      message: "Check your email to verify your account.",
    });
  } catch (error) {
    console.error("Register error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function handleLogin(c: Context<{ Bindings: Env }>) {
  try {
    const body = (await c.req.json()) as {
      username?: string;
      password?: string;
    };
    const { username, password } = body;
    if (!username || !password) {
      return c.json({ error: "Username and password are required." }, 400);
    }
    const dao = getDAOFactory(c.env);
    const user = await dao.authUserDAO.getUserByUsername(username.trim());
    if (!user) {
      return c.json({ error: "Invalid username or password." }, 401);
    }
    if (!user.password_hash) {
      return c.json(
        { error: "This account uses Google sign-in. Use Sign in with Google." },
        400
      );
    }
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return c.json({ error: "Invalid username or password." }, 401);
    }
    if (!user.email_verified_at) {
      return c.json(
        {
          error: "Verify your email first.",
          code: "EMAIL_NOT_VERIFIED",
        },
        403
      );
    }
    const authService = getAuthService(c.env);
    const result = await authService.authenticateUser({
      username: user.username,
      openaiApiKey: undefined,
      adminSecret: undefined,
      isAdmin: !!user.is_admin,
    });
    if (!result.success || !result.token) {
      return c.json({ error: "Authentication failed." }, 500);
    }
    return c.json({ token: result.token });
  } catch (error) {
    console.error("Login error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function handleVerifyEmail(c: Context<{ Bindings: Env }>) {
  try {
    const token = c.req.query("token");
    if (!token) {
      return c.redirect(
        `${(c.env.APP_ORIGIN as string) ?? DEFAULT_APP_ORIGIN}#verify=missing_token`
      );
    }
    const dao = getDAOFactory(c.env);
    const row = await dao.authUserDAO.getVerificationToken(token);
    const appOrigin = (c.env.APP_ORIGIN as string) ?? DEFAULT_APP_ORIGIN;
    if (!row) {
      return c.redirect(`${appOrigin}#verify=invalid_or_expired`);
    }
    await dao.authUserDAO.setEmailVerified(row.username);
    await dao.authUserDAO.deleteVerificationToken(token);
    const verifiedUser = await dao.authUserDAO.getUserByUsername(row.username);
    const authService = getAuthService(c.env);
    const result = await authService.authenticateUser({
      username: row.username,
      openaiApiKey: undefined,
      adminSecret: undefined,
      isAdmin: !!verifiedUser?.is_admin,
    });
    if (result.success && result.token) {
      return c.redirect(
        `${appOrigin}#token=${encodeURIComponent(result.token)}`
      );
    }
    return c.redirect(`${appOrigin}#verify=success`);
  } catch (error) {
    console.error("Verify email error:", error);
    const appOrigin = (c.env.APP_ORIGIN as string) ?? DEFAULT_APP_ORIGIN;
    return c.redirect(`${appOrigin}#verify=error`);
  }
}

export async function handleResendVerification(c: Context<{ Bindings: Env }>) {
  try {
    const body = (await c.req.json()) as {
      email?: string;
      username?: string;
    };
    const email = body.email?.trim().toLowerCase();
    const username = body.username?.trim();
    if (!email && !username) {
      return c.json(
        { error: "Provide email or username to resend verification." },
        400
      );
    }
    const dao = getDAOFactory(c.env);
    const user = email
      ? await dao.authUserDAO.getUserByEmail(email)
      : await dao.authUserDAO.getUserByUsername(username!);
    if (!user) {
      return c.json({
        success: true,
        message: "If that account exists, we sent an email.",
      });
    }
    if (user.email_verified_at) {
      return c.json({ success: true, message: "Account is already verified." });
    }
    await dao.authUserDAO.deleteVerificationTokensForUser(user.username);
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await dao.authUserDAO.createVerificationToken(
      token,
      user.username,
      expiresAt
    );
    const apiOrigin = new URL(c.req.url).origin;
    const verificationLink = `${apiOrigin}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const resendKey = await getEnvVar(c.env, "RESEND_API_KEY", false);
    const fromAddress =
      (await getEnvVar(c.env, "VERIFICATION_EMAIL_FROM", false)) ||
      "LoreSmith <noreply@example.com>";
    if (resendKey) {
      const emailService = new EmailService(resendKey);
      await emailService.sendVerificationEmail({
        to: user.email,
        verificationLink,
        fromAddress,
      });
    }
    return c.json({
      success: true,
      message: "If that account exists, we sent a verification email.",
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    return c.json({ error: "Internal server error" }, 500);
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
