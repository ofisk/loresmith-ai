import type { Context } from "hono";
import { jwtVerify } from "jose";
import { type EnvWithSecrets, getEnvVar } from "@/lib/env-utils";
import type { AuthEnv, AuthPayload } from "@/services/core/auth-service";

export interface Env extends AuthEnv, EnvWithSecrets {
  R2: R2Bucket;
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  CHAT: DurableObjectNamespace;
  NOTIFICATIONS: DurableObjectNamespace;
  UPLOAD_SESSION: DurableObjectNamespace;
  ASSETS: Fetcher;
  FILE_PROCESSING_QUEUE: Queue;
  FILE_PROCESSING_DLQ: Queue;
  AUTORAG_BASE_URL: string;
  AUTORAG_ACCOUNT_ID: string;
  AUTORAG_API_TOKEN: string | { get(): Promise<string> };
  AUTORAG_PREFIX?: string;
}

// Set user authentication data in context
export function setUserAuth(c: Context, payload: AuthPayload) {
  c.set("userAuth", payload);
}

// Middleware to require valid JWT token
export async function requireUserJwt(
  c: Context<{ Bindings: Env }>,
  next: () => Promise<void>
): Promise<Response | undefined> {
  console.log("[requireUserJwt] Middleware called for:", c.req.path);
  const authHeader = c.req.header("Authorization");
  console.log(
    "[requireUserJwt] Auth header:",
    `${authHeader?.substring(0, 20)}...`
  );

  const bearerTokenRegex = /^Bearer\s+(.+)$/i;
  const match = authHeader?.match(bearerTokenRegex);

  if (!match) {
    return c.json({ error: "Authorization header required" }, 401);
  }

  const token = match[1];
  console.log("[requireUserJwt] Token:", `${token.substring(0, 20)}...`);

  try {
    // For JWT verification, we need to try the same secret that was used for signing
    let secret: string;

    console.log("[requireUserJwt] Environment debug:", {
      hasEnv: !!c.env,
      adminSecretType: typeof c.env.ADMIN_SECRET,
      adminSecretKeys: c.env.ADMIN_SECRET
        ? Object.keys(c.env.ADMIN_SECRET)
        : "null",
      processEnvAdmin: process.env.ADMIN_SECRET ? "present" : "not present",
    });

    try {
      secret = await getEnvVar(c.env, "ADMIN_SECRET");
    } catch (_error) {
      // If ADMIN_SECRET is not available, use the same fallback as the auth service
      console.warn(
        "[requireUserJwt] ADMIN_SECRET not available, using fallback for verification"
      );
      secret = "fallback-jwt-secret-for-non-admin-users";
    }

    const jwtSecret = new TextEncoder().encode(secret);
    console.log("[requireUserJwt] JWT secret length:", jwtSecret.length);

    const { payload } = await jwtVerify(token, jwtSecret);
    console.log(
      "[requireUserJwt] JWT payload: { type:",
      payload.type,
      ", username:",
      payload.username,
      ", isAdmin:",
      payload.isAdmin,
      " }"
    );

    if (payload.type !== "user-auth") {
      return c.json({ error: "Invalid token type" }, 401);
    }

    const userAuth = payload as AuthPayload;
    console.log(
      "[requireUserJwt] User auth set: { type:",
      userAuth.type,
      ", username:",
      userAuth.username,
      ", isAdmin:",
      userAuth.isAdmin,
      " }"
    );

    setUserAuth(c, userAuth);
    await next();
  } catch (error) {
    console.error("[requireUserJwt] JWT verification failed:", error);
    return c.json({ error: "Invalid token" }, 401);
  }
}
