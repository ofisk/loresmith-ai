import type { Context, Next } from "hono";
import { type AuthContext, type AuthEnv, extractAuthFromHeader } from "./auth";

/**
 * Middleware to require JWT authentication
 * Attaches auth payload to context.var.auth
 */
export async function requireAuth(
  c: Context<{ Bindings: AuthEnv; Variables: AuthContext }>,
  next: Next
): Promise<Response | void> {
  const authHeader = c.req.header("Authorization");
  const auth = await extractAuthFromHeader(authHeader, c.env);

  if (!auth) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  // Attach auth info to context
  c.set("auth", auth);

  await next();
}

/**
 * Optional authentication middleware
 * Attaches auth payload to context.var.auth if valid token is provided
 * Does not return error if no token is provided
 */
export async function optionalAuth(
  c: Context<{ Bindings: AuthEnv; Variables: AuthContext }>,
  next: Next
): Promise<void> {
  const authHeader = c.req.header("Authorization");
  const auth = await extractAuthFromHeader(authHeader, c.env);

  if (auth) {
    c.set("auth", auth);
  }

  await next();
}

/**
 * Middleware to require specific username
 * Must be used after requireAuth middleware
 */
export async function requireUsername(username: string) {
  return async (
    c: Context<{ Bindings: AuthEnv; Variables: AuthContext }>,
    next: Next
  ): Promise<Response | void> => {
    const auth = c.get("auth");
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (auth.username !== username) {
      return c.json({ error: "Access denied" }, 403);
    }

    await next();
  };
}

/**
 * Middleware to validate that a resource belongs to the authenticated user
 * Must be used after requireAuth middleware
 * Expects resourceId parameter in the route
 */
export async function requireResourceOwnership(
  c: Context<{ Bindings: AuthEnv; Variables: AuthContext }>,
  next: Next
): Promise<Response | void> {
  const auth = c.get("auth");
  if (!auth) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const resourceId =
    c.req.param("resourceId") || c.req.param("campaignId") || c.req.param("id");

  if (!resourceId) {
    return c.json({ error: "Resource ID required" }, 400);
  }

  // For now, we'll just validate that the user is authenticated
  // In the future, you could add additional ownership validation here
  // For example, checking if the resource exists and belongs to the user

  await next();
}
