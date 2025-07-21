import { type JWTPayload, jwtVerify } from "jose";
import { USER_MESSAGES } from "../constants";

// Common auth payload interface used across the application
export interface AuthPayload extends JWTPayload {
  type: "user-auth";
  username: string;
}

// Environment interface that includes auth-related fields
export interface AuthEnv {
  ADMIN_SECRET?: string;
}

// Context interface that includes auth-related fields
export interface AuthContext {
  auth?: AuthPayload;
}

/**
 * Get the JWT secret key from environment
 */
export function getJwtSecret(env: AuthEnv): Uint8Array {
  const secret = env.ADMIN_SECRET || process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SECRET not configured");
  }
  return new TextEncoder().encode(secret);
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
    const { payload } = await jwtVerify(token, getJwtSecret(env));
    if (!payload || payload.type !== "user-auth") {
      return null;
    }
    return payload as AuthPayload;
  } catch (_err) {
    return null;
  }
}

/**
 * Get username from Authorization header
 * Returns null if no valid token is provided
 */
export async function getUsernameFromHeader(
  authHeader: string | null | undefined,
  env: AuthEnv
): Promise<string | null> {
  const auth = await extractAuthFromHeader(authHeader, env);
  return auth?.username || null;
}

/**
 * Generate a user-scoped key for KV storage
 * Format: user:{username}:{resourceType}:{resourceId}
 */
export function generateUserKey(
  username: string,
  resourceType: string,
  resourceId?: string
): string {
  if (resourceId) {
    return `user:${username}:${resourceType}:${resourceId}`;
  }
  return `user:${username}:${resourceType}`;
}

/**
 * Generate a user-scoped prefix for KV listing
 * Format: user:{username}:{resourceType}:
 */
export function generateUserPrefix(
  username: string,
  resourceType: string
): string {
  return `user:${username}:${resourceType}:`;
}

/**
 * Extract username from a user-scoped key
 * Returns null if the key doesn't match the expected format
 */
export function extractUsernameFromKey(key: string): string | null {
  const parts = key.split(":");
  if (parts.length >= 3 && parts[0] === "user") {
    return parts[1];
  }
  return null;
}

/**
 * Validate that a key belongs to a specific user
 */
export function validateUserKey(key: string, username: string): boolean {
  const keyUsername = extractUsernameFromKey(key);
  return keyUsername === username;
}

/**
 * Helper function to get stored JWT from localStorage (client-side)
 */
export function getStoredJwt(): string | null {
  if (typeof window === "undefined") {
    return null; // Server-side
  }
  return localStorage.getItem("user_auth_jwt");
}

/**
 * Helper function to store JWT in localStorage (client-side)
 */
export function storeJwt(token: string): void {
  if (typeof window === "undefined") {
    return; // Server-side
  }
  localStorage.setItem("user_auth_jwt", token);
}

/**
 * Helper function to clear JWT from localStorage (client-side)
 */
export function clearJwt(): void {
  if (typeof window === "undefined") {
    return; // Server-side
  }
  localStorage.removeItem("user_auth_jwt");
}

/**
 * Helper function to create authenticated headers for API requests
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
 * Helper function to create authenticated headers using stored JWT
 */
export function createAuthHeadersFromStorage(): Record<string, string> {
  const jwt = getStoredJwt();
  return createAuthHeaders(jwt);
}

/**
 * Check if a JWT token is expired
 */
export function isJwtExpired(jwt: string): boolean {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    const exp = payload.exp;
    if (!exp) return true;

    // Convert to milliseconds and compare with current time
    const expirationTime = exp * 1000;
    const currentTime = Date.now();

    return currentTime >= expirationTime;
  } catch {
    // If we can't decode the JWT, consider it expired
    return true;
  }
}

/**
 * Clear JWT from localStorage and trigger re-authentication
 * This function should be called when a 401 response is received
 */
export function handleJwtExpiration(): void {
  if (typeof window === "undefined") {
    return; // Server-side
  }

  // Clear the JWT from localStorage
  localStorage.removeItem("user_auth_jwt");

  // Dispatch a custom event to notify components about JWT expiration
  window.dispatchEvent(
    new CustomEvent("jwt-expired", {
      detail: { message: USER_MESSAGES.SESSION_EXPIRED },
    })
  );
}

/**
 * Enhanced fetch function that automatically handles JWT expiration
 * Returns the response and a boolean indicating if JWT was expired
 */
export async function authenticatedFetchWithExpiration(
  url: string,
  options: RequestInit & { jwt?: string | null } = {}
): Promise<{ response: Response; jwtExpired: boolean }> {
  const { jwt, ...fetchOptions } = options;

  const headers = createAuthHeaders(jwt);

  // Merge with any existing headers
  if (fetchOptions.headers) {
    Object.assign(headers, fetchOptions.headers);
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  // Check if the response indicates JWT expiration
  const jwtExpired = response.status === 401;

  if (jwtExpired) {
    handleJwtExpiration();
  }

  return { response, jwtExpired };
}
