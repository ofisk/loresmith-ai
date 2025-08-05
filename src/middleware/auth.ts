import type { Context } from "hono";
import { jwtVerify } from "jose";
import type { AuthEnv, AuthPayload } from "../services/auth-service";

export interface Env extends AuthEnv {
  PDF_BUCKET: R2Bucket;
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  Chat: DurableObjectNamespace;
  UserFileTracker: DurableObjectNamespace;
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

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Authorization header required" }, 401);
  }

  const token = authHeader.substring(7);
  console.log("[requireUserJwt] Token:", `${token.substring(0, 20)}...`);

  try {
    // Get secret from Secrets Store
    const secret = c.env.ADMIN_SECRET
      ? await c.env.ADMIN_SECRET.get()
      : "default-secret-key";
    const jwtSecret = new TextEncoder().encode(secret);
    console.log("[requireUserJwt] JWT secret length:", jwtSecret.length);
    console.log(
      "[requireUserJwt] JWT secret bytes:",
      Array.from(jwtSecret).slice(0, 10)
    );
    console.log("[requireUserJwt] Using Secrets Store for verification");

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
