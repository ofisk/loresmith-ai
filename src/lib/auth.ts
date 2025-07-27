import { SignJWT, jwtVerify } from "jose";
import type { JWTPayload } from "jose";

export interface AuthPayload extends JWTPayload {
  type: "user-auth";
  username: string;
  openaiApiKey?: string;
}

export interface AuthEnv {
  OPENAI_API_KEY?: string;
  ADMIN_SECRET?: string;
  Chat: DurableObjectNamespace;
}

export interface AuthRequest {
  username: string;
  openaiApiKey?: string;
  providedKey: string;
  sessionId?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  hasDefaultOpenAIKey?: boolean;
  requiresOpenAIKey?: boolean;
  error?: string;
}

export interface AuthContext {
  auth?: AuthPayload;
}

/**
 * Get JWT secret from environment
 */
export async function getJwtSecret(env: AuthEnv): Promise<Uint8Array> {
  // Use admin secret for JWT signing
  const secret = env.ADMIN_SECRET || "default-secret-key";
  return new TextEncoder().encode(secret);
}

/**
 * Simple authentication based on username whitelist
 */
export async function authenticateUser(
  request: AuthRequest,
  env: AuthEnv
): Promise<AuthResponse> {
  const { username, openaiApiKey, providedKey } = request;

  // Validate required fields
  if (!username || typeof username !== "string" || username.trim() === "") {
    return {
      success: false,
      error: "Username is required",
    };
  }

  if (
    !providedKey ||
    typeof providedKey !== "string" ||
    providedKey.trim() === ""
  ) {
    return {
      success: false,
      error: "Admin key is required",
    };
  }

  // Simple access control: check if admin key is valid
  const validAdminKey = env.ADMIN_SECRET
    ? await env.ADMIN_SECRET
    : "undefined-admin-key";
  const isValidAdminKey = providedKey.trim() === validAdminKey;

  const envAdminSecretValue = env.ADMIN_SECRET ? await env.ADMIN_SECRET : null;
  console.log("Admin key validation:", {
    providedKey: providedKey
      ? `${providedKey.substring(0, 4)}...`
      : "undefined",
    validAdminKey: validAdminKey
      ? `${validAdminKey.substring(0, 4)}...`
      : "undefined",
    providedKeyLength: providedKey?.length || 0,
    validAdminKeyLength: validAdminKey?.length || 0,
    providedKeyTrimmed: providedKey?.trim(),
    validAdminKeyTrimmed: validAdminKey?.trim(),
    areEqual: providedKey.trim() === validAdminKey,
    areEqualTrimmed: providedKey.trim() === validAdminKey.trim(),
    envHasAdminSecret: !!env.ADMIN_SECRET,
    envAdminSecretValue: envAdminSecretValue
      ? `${envAdminSecretValue.substring(0, 4)}...`
      : "undefined",
  });

  if (!isValidAdminKey) {
    return {
      success: false,
      error:
        "Invalid admin key. Please contact the administrator for the correct key.",
    };
  }

  // Check for default OpenAI key
  const hasDefaultOpenAIKey =
    !!env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim().length > 0;

  // Determine which API key to use
  const finalApiKey = openaiApiKey?.trim() || null;

  // Require API key if no default is available
  if (!hasDefaultOpenAIKey && !finalApiKey) {
    return {
      success: false,
      error: "OpenAI API key is required when no default key is configured",
      requiresOpenAIKey: true,
    };
  }

  // Generate JWT
  const jwtPayload: AuthPayload = {
    type: "user-auth",
    username: username.trim(),
    ...(finalApiKey && { openaiApiKey: finalApiKey }),
  };

  try {
    const jwtSecret = await getJwtSecret(env);
    const jwt = await new SignJWT(jwtPayload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1d")
      .sign(jwtSecret);

    return {
      success: true,
      token: jwt,
      hasDefaultOpenAIKey,
      requiresOpenAIKey: !hasDefaultOpenAIKey && !finalApiKey,
    };
  } catch (error) {
    console.error("JWT generation error:", error);
    return {
      success: false,
      error: "Failed to generate authentication token",
    };
  }
}

/**
 * Extract and validate JWT token from Authorization header
 */
export async function extractAuthFromHeader(
  authHeader: string | null | undefined,
  env: AuthEnv
): Promise<AuthPayload | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);

  try {
    const jwtSecret = await getJwtSecret(env);
    const { payload } = await jwtVerify(token, jwtSecret);

    if (payload.type === "user-auth") {
      return payload as AuthPayload;
    }
  } catch (error) {
    console.error("JWT verification error:", error);
  }

  return null;
}

/**
 * Extract username from Authorization header
 */
export async function getUsernameFromHeader(
  authHeader: string | null | undefined,
  env: AuthEnv
): Promise<string | null> {
  const auth = await extractAuthFromHeader(authHeader, env);
  return auth?.username || null;
}

/**
 * Generate a user-specific key for resources
 */
export function generateUserKey(
  username: string,
  resourceType: string,
  resourceId?: string
): string {
  const base = `${username}:${resourceType}`;
  return resourceId ? `${base}:${resourceId}` : base;
}

/**
 * Generate a user-specific prefix for resources
 */
export function generateUserPrefix(
  username: string,
  resourceType: string
): string {
  return `${username}:${resourceType}:`;
}

/**
 * Extract username from a user key
 */
export function extractUsernameFromKey(key: string): string | null {
  const parts = key.split(":");
  return parts.length >= 2 ? parts[0] : null;
}

/**
 * Validate that a key belongs to a specific user
 */
export function validateUserKey(key: string, username: string): boolean {
  const keyUsername = extractUsernameFromKey(key);
  return keyUsername === username;
}

/**
 * Get stored JWT from localStorage
 */
export function getStoredJwt(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("loresmith-jwt");
}

/**
 * Store JWT in localStorage
 */
export function storeJwt(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("loresmith-jwt", token);
}

/**
 * Clear JWT from localStorage
 */
export function clearJwt(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("loresmith-jwt");
}

/**
 * Create auth headers with JWT
 */
export function createAuthHeaders(jwt?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (jwt) {
    headers.Authorization = `Bearer ${jwt}`;
  }

  return headers;
}

/**
 * Create auth headers from stored JWT
 */
export function createAuthHeadersFromStorage(): Record<string, string> {
  const jwt = getStoredJwt();
  return createAuthHeaders(jwt);
}

/**
 * Check if JWT is expired
 */
export function isJwtExpired(jwt: string): boolean {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    const exp = payload.exp * 1000; // Convert to milliseconds
    return Date.now() >= exp;
  } catch {
    return true;
  }
}

/**
 * Handle JWT expiration
 */
export function handleJwtExpiration(): void {
  const jwt = getStoredJwt();
  if (jwt && isJwtExpired(jwt)) {
    clearJwt();
    // Optionally redirect to login or show login modal
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }
}

/**
 * Fetch with automatic JWT expiration handling
 */
export async function authenticatedFetchWithExpiration(
  url: string,
  options: RequestInit & { jwt?: string | null } = {}
): Promise<{ response: Response; jwtExpired: boolean }> {
  const jwt = options.jwt || getStoredJwt();
  let jwtExpired = false;

  if (jwt && isJwtExpired(jwt)) {
    clearJwt();
    jwtExpired = true;
  }

  const headers = {
    ...options.headers,
    ...createAuthHeaders(jwt),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  return { response, jwtExpired };
}
