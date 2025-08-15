import type { Context } from "hono";
import { jwtVerify } from "jose";
import type { AuthEnv, AuthPayload } from "../services/auth-service";

export interface Env extends AuthEnv {
  FILE_BUCKET: R2Bucket;
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  Chat: DurableObjectNamespace;
  UserFileTracker: DurableObjectNamespace;
  UploadSession: DurableObjectNamespace;
  ASSETS: Fetcher;
  PDF_PROCESSING_QUEUE: Queue;
  PDF_PROCESSING_DLQ: Queue;
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
    // Get secret - handle both local development and production
    let secret: string;

    if (typeof c.env.ADMIN_SECRET === "string") {
      // Local development: direct string from .dev.vars
      secret = c.env.ADMIN_SECRET;
      console.log(
        "[requireUserJwt] Using local environment variable for verification"
      );
    } else if (
      c.env.ADMIN_SECRET &&
      typeof c.env.ADMIN_SECRET.get === "function"
    ) {
      // Production: Cloudflare secrets store
      try {
        secret = await c.env.ADMIN_SECRET.get();
        console.log("[requireUserJwt] Using Secrets Store for verification");
      } catch (error) {
        console.warn("[requireUserJwt] Error accessing Secrets Store:", error);
        secret = "fallback-jwt-secret-no-admin-access";
        console.log("[requireUserJwt] Using fallback secret for verification");
      }
    } else {
      // Fallback
      secret = "fallback-jwt-secret-no-admin-access";
      console.log("[requireUserJwt] Using fallback secret for verification");
    }

    console.log("secret: " + JSON.stringify(secret));
    const jwtSecret = new TextEncoder().encode(secret);
    console.log("[requireUserJwt] JWT secret length:", jwtSecret.length);

    const { payload } = await jwtVerify(token, jwtSecret);
    console.log("[requireUserJwt] JWT payload:", payload);

    if (payload.type !== "user-auth") {
      return c.json({ error: "Invalid token type" }, 401);
    }

    const userAuth = payload as AuthPayload;
    console.log("[requireUserJwt] User auth set:", userAuth);

    setUserAuth(c, userAuth);
    await next();
  } catch (error) {
    console.error("[requireUserJwt] JWT verification failed:", error);
    return c.json({ error: "Invalid token" }, 401);
  }
}
