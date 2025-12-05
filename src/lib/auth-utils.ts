import type { Context } from "hono";

/**
 * Extract JWT token from Authorization header
 * Handles both Hono Context and standard Request headers
 *
 * @param authHeader - Authorization header value (e.g., "Bearer <token>")
 * @returns JWT token string or undefined if not found/invalid
 *
 * @example
 * ```typescript
 * // From Hono Context
 * const authHeader = c.req.header("Authorization");
 * const jwt = extractJwtFromHeader(authHeader);
 *
 * // From standard Request
 * const authHeader = request.headers.get("Authorization");
 * const jwt = extractJwtFromHeader(authHeader);
 * ```
 */
export function extractJwtFromHeader(
  authHeader: string | null | undefined
): string | undefined {
  if (!authHeader) {
    return undefined;
  }

  // Handle "Bearer <token>" format (case-insensitive)
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (match) {
    return match[1];
  }

  // Fallback: if header doesn't start with "Bearer ", assume it's the token itself
  // This handles edge cases where the header might already be just the token
  return authHeader.trim() || undefined;
}

/**
 * Extract JWT token from Hono Context Authorization header
 * Convenience wrapper for extractJwtFromHeader
 *
 * @param c - Hono Context
 * @returns JWT token string or undefined if not found/invalid
 *
 * @example
 * ```typescript
 * const jwt = extractJwtFromContext(c);
 * ```
 */
export function extractJwtFromContext(
  c: Context | { req: { header: (name: string) => string | undefined } }
): string | undefined {
  const authHeader = c.req.header("Authorization");
  return extractJwtFromHeader(authHeader);
}
