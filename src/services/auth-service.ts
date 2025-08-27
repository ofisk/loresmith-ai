import type { JWTPayload } from "jose";
import { jwtVerify, SignJWT } from "jose";
import { ERROR_MESSAGES, JWT_STORAGE_KEY } from "../constants";
import { getDAOFactory } from "../dao";
import { getEnvVar } from "../lib/env-utils";
import { getAuthService } from "../lib/service-factory";
import type { Env } from "../middleware/auth";

export interface AuthPayload extends JWTPayload {
  type: "user-auth";
  username: string;
  openaiApiKey?: string;
  isAdmin: boolean; // Added admin status
}

export interface AuthEnv {
  OPENAI_API_KEY?: string;
  ADMIN_SECRET?: string | { get(): Promise<string> };
  Chat: DurableObjectNamespace;
}

export interface AuthRequest {
  username: string;
  openaiApiKey?: string;
  adminSecret?: string; // Made optional
  sessionId?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  error?: string;
}

export interface AuthContext {
  auth?: AuthPayload;
}

/**
 * Centralized authentication service for Loresmith AI
 *
 * This service consolidates all authentication operations including:
 * - JWT creation and verification
 * - User authentication
 * - Header management
 * - Session handling
 * - Error handling
 */
export class AuthService {
  constructor(private env: Env) {}

  /**
   * Get JWT secret from environment
   */
  async getJwtSecret(): Promise<Uint8Array> {
    // For JWT signing, we need a secret. If ADMIN_SECRET is not available, use a fallback
    let secret: string;

    try {
      secret = await getEnvVar(this.env, "ADMIN_SECRET");
    } catch (_error) {
      // If ADMIN_SECRET is not available, use a fallback secret for JWT signing
      // This allows non-admin users to still authenticate
      console.warn(
        "[AuthService] ADMIN_SECRET not available, using fallback for JWT signing"
      );
      secret = "fallback-jwt-secret-for-non-admin-users";
    }

    return new TextEncoder().encode(secret);
  }

  /**
   * Authenticate a user and create a JWT token
   */
  async authenticateUser(request: AuthRequest): Promise<AuthResponse> {
    const { username, openaiApiKey, adminSecret } = request;

    // Validate required fields
    if (!username || typeof username !== "string" || username.trim() === "") {
      return {
        success: false,
        error: "Username is required",
      };
    }

    // Check if admin key is valid (if provided)
    let isAdmin = false;
    if (adminSecret && adminSecret.trim() !== "") {
      let validAdminKey: string | null = null;

      try {
        // Use the same utility function for consistency
        validAdminKey = await getEnvVar(this.env, "ADMIN_SECRET");
      } catch (_error) {
        console.warn(
          "[AuthService] ADMIN_SECRET not available - admin access disabled"
        );
        // Continue with validAdminKey as null - user will not get admin access
      }

      // Only validate admin status if we have a valid admin key configured
      if (validAdminKey && validAdminKey.trim() !== "") {
        isAdmin = adminSecret.trim() === validAdminKey;
      } else {
        console.log(
          "[AuthService] ADMIN_SECRET not configured - admin access disabled"
        );
        console.log(
          "[AuthService] Users will be treated as non-admin regardless of provided admin key"
        );
        // validAdminKey is null/empty, so isAdmin remains false
        // User will be treated as non-admin regardless of what they provide
      }
    }

    try {
      // Create JWT token
      const secret = await this.getJwtSecret();
      console.log(
        "[AuthService] Creating JWT with secret length:",
        secret.length
      );
      console.log(
        "[AuthService] Secret bytes:",
        Array.from(secret).slice(0, 10)
      );

      const token = await new SignJWT({
        type: "user-auth",
        username,
        openaiApiKey,
        isAdmin, // Include admin status in JWT
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("24h")
        .sign(secret);

      console.log(
        `[AuthService] Authentication successful for user: ${username} (${isAdmin ? "Admin" : "Regular user"})`
      );

      return {
        success: true,
        token,
      };
    } catch (error) {
      console.error("[AuthService] Error creating JWT:", error);
      return {
        success: false,
        error: "Failed to create authentication token",
      };
    }
  }

  /**
   * Extract and verify JWT from Authorization header
   */
  async extractAuthFromHeader(
    authHeader: string | null | undefined
  ): Promise<AuthPayload | null> {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    try {
      const token = authHeader.substring(7);
      const secret = await this.getJwtSecret();
      const { payload } = await jwtVerify(token, secret);

      if (payload.type !== "user-auth") {
        console.log("[AuthService] Invalid token type:", payload.type);
        return null;
      }

      return payload as AuthPayload;
    } catch (error) {
      console.error("[AuthService] JWT verification failed:", error);
      return null;
    }
  }

  static async extractAuthFromHeader(
    authHeader: string | null | undefined,
    env: any
  ): Promise<AuthPayload | null> {
    const authService = getAuthService(env);
    return authService.extractAuthFromHeader(authHeader);
  }

  /**
   * Get username from Authorization header
   */
  async getUsernameFromHeader(
    authHeader: string | null | undefined
  ): Promise<string | null> {
    const auth = await this.extractAuthFromHeader(authHeader);
    return auth?.username || null;
  }

  /**
   * Create authentication headers for API requests
   */
  static createAuthHeaders(jwt?: string | null): Record<string, string> {
    return {
      Authorization: jwt ? `Bearer ${jwt}` : "",
      "Content-Type": "application/json",
    };
  }

  /**
   * Create authentication headers from stored JWT
   */
  static createAuthHeadersFromStorage(): Record<string, string> {
    const jwt = AuthService.getStoredJwt();
    return AuthService.createAuthHeaders(jwt);
  }

  /**
   * Check if JWT is expired
   */
  static isJwtExpired(jwt: string): boolean {
    try {
      const payload = JSON.parse(atob(jwt.split(".")[1]));
      const exp = payload.exp * 1000; // Convert to milliseconds
      return Date.now() >= exp;
    } catch (error) {
      console.error("[AuthService] Error checking JWT expiration:", error);
      return true; // Consider expired if we can't parse
    }
  }

  /**
   * Handle JWT expiration
   */
  handleJwtExpiration(): void {
    console.log("[AuthService] JWT expired, clearing stored token");
    AuthService.clearJwt();
  }

  // Static helper methods that don't require instance creation
  static getStoredJwt(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(JWT_STORAGE_KEY);
  }

  static storeJwt(token: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(JWT_STORAGE_KEY, token);
  }

  static clearJwt(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(JWT_STORAGE_KEY);
  }

  /**
   * Make authenticated fetch request with JWT expiration handling
   */
  async authenticatedFetchWithExpiration(
    url: string,
    options: RequestInit & { jwt?: string | null } = {}
  ): Promise<{ response: Response; jwtExpired: boolean }> {
    const { jwt, ...fetchOptions } = options;
    const headers = AuthService.createAuthHeaders(jwt);

    // Merge with any existing headers
    if (fetchOptions.headers) {
      Object.assign(headers, fetchOptions.headers);
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    // Check if JWT expired
    const jwtExpired = response.status === 401;
    if (jwtExpired) {
      this.handleJwtExpiration();
    }

    return { response, jwtExpired };
  }

  static async authenticatedFetchWithExpiration(
    url: string,
    options: RequestInit & { jwt?: string | null } = {}
  ): Promise<{ response: Response; jwtExpired: boolean }> {
    const { jwt, ...fetchOptions } = options;
    const headers = AuthService.createAuthHeaders(jwt);

    // Merge with any existing headers
    if (fetchOptions.headers) {
      Object.assign(headers, fetchOptions.headers);
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    // Check if JWT expired
    const jwtExpired = response.status === 401;
    if (jwtExpired) {
      AuthService.clearJwt();
    }

    return { response, jwtExpired };
  }

  /**
   * Generate user-specific key for resources
   */
  generateUserKey(
    username: string,
    resourceType: string,
    resourceId?: string
  ): string {
    const base = `${username}:${resourceType}`;
    return resourceId ? `${base}:${resourceId}` : base;
  }

  /**
   * Generate user prefix for resource queries
   */
  generateUserPrefix(username: string, resourceType: string): string {
    return `${username}:${resourceType}:`;
  }

  /**
   * Extract username from a resource key
   */
  extractUsernameFromKey(key: string): string | null {
    const parts = key.split(":");
    return parts.length >= 2 ? parts[0] : null;
  }

  /**
   * Validate that a resource key belongs to a user
   */
  validateUserKey(key: string, username: string): boolean {
    const extractedUsername = this.extractUsernameFromKey(key);
    return extractedUsername === username;
  }

  /**
   * Handle authentication errors consistently
   */
  handleAuthError(response: Response): string | null {
    if (response.status === 401) {
      return ERROR_MESSAGES.AUTHENTICATION_REQUIRED;
    }
    if (response.status === 403) {
      return ERROR_MESSAGES.ACCESS_DENIED;
    }
    return null;
  }

  /**
   * Create authenticated API request options for tools
   */
  createToolAuthOptions(jwt?: string | null): {
    headers: Record<string, string>;
  } {
    return {
      headers: AuthService.createAuthHeaders(jwt),
    };
  }

  // OpenAI API Key Management

  /**
   * Caching interface for OpenAI API keys
   */
  static readonly OpenAIKeyCache = {
    getCachedKey(): string | null {
      return null; // To be implemented by implementing classes
    },
    async setCachedKey(_key: string): Promise<void> {
      // To be implemented by implementing classes
    },
    async clearCachedKey(): Promise<void> {
      // To be implemented by implementing classes
    },
  };

  /**
   * Utility function to parse JWT and extract username
   */
  static parseJwtForUsername(jwt: string): string | null {
    try {
      const payload = JSON.parse(atob(jwt.split(".")[1]));
      return payload.username || null;
    } catch (error) {
      console.error("Error parsing JWT for username:", error);
      return null;
    }
  }

  /**
   * Utility function to get username from stored JWT
   * This combines getting the stored JWT and extracting the username
   */
  static getUsernameFromStoredJwt(): string | null {
    try {
      const jwt = AuthService.getStoredJwt();
      if (!jwt) return null;
      return AuthService.parseJwtForUsername(jwt);
    } catch (error) {
      console.error("Error getting username from stored JWT:", error);
      return null;
    }
  }

  /**
   * Utility function to get full JWT payload from stored JWT
   * This is useful for components that need more than just the username
   */
  static getJwtPayload(): any | null {
    try {
      const jwt = AuthService.getStoredJwt();
      if (!jwt) return null;
      const payload = JSON.parse(atob(jwt.split(".")[1]));
      return payload;
    } catch (error) {
      console.error("Error getting JWT payload:", error);
      return null;
    }
  }

  /**
   * Utility function to extract username from message data
   */
  static extractUsernameFromMessage(message: any): string | null {
    if (
      message?.data &&
      typeof message.data === "object" &&
      "jwt" in message.data
    ) {
      return AuthService.parseJwtForUsername((message.data as any).jwt);
    }
    return null;
  }

  /**
   * Utility function to get OpenAI API key from database for a specific user
   */
  static async getUserOpenAIKeyFromDB(
    db: D1Database,
    username: string
  ): Promise<string | null> {
    try {
      const daoFactory = getDAOFactory({ DB: db });
      return await daoFactory.userDAO.getOpenAIKey(username);
    } catch (error) {
      console.error("Error getting user OpenAI key from DB:", error);
      return null;
    }
  }

  /**
   * Helper function to load OpenAI API key with caching
   */
  static async loadUserOpenAIKeyWithCache(
    username: string,
    db: D1Database,
    cache: {
      getCachedKey(): string | null;
      setCachedKey(key: string): Promise<void>;
      clearCachedKey(): Promise<void>;
    }
  ): Promise<string | null> {
    try {
      // First check if we already have it cached
      const cachedKey = cache.getCachedKey();
      if (cachedKey) {
        return cachedKey;
      }

      // If not cached, get from database
      const apiKey = await AuthService.getUserOpenAIKeyFromDB(db, username);
      if (apiKey) {
        // Cache it
        await cache.setCachedKey(apiKey);
        console.log("Cached OpenAI API key from database for user:", username);
      }

      return apiKey;
    } catch (error) {
      console.error("Error loading user OpenAI key with cache:", error);
      return null;
    }
  }

  /**
   * Handle setting user's OpenAI API key in a durable object
   */
  static async handleSetUserOpenAIKey(
    request: Request,
    durableObject: { setUserOpenAIKey: (key: string) => Promise<void> }
  ): Promise<Response> {
    try {
      const body = (await request.json()) as { openaiApiKey: string };
      const { openaiApiKey } = body;

      if (!openaiApiKey) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "OpenAI API key is required",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // Set the API key in the durable object
      await durableObject.setUserOpenAIKey(openaiApiKey);

      return new Response(
        JSON.stringify({
          success: true,
          message: "OpenAI API key set successfully",
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error("Error setting user OpenAI key:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to set OpenAI API key",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  /**
   * Create a modified request with authentication context for agent routing
   * This adds auth info to headers so the agent can access it
   */
  static createRequestWithAuthContext(
    originalRequest: Request,
    authPayload: AuthPayload | null
  ): Request {
    if (!authPayload) {
      return originalRequest;
    }

    // Add auth info to headers for the agent to access
    const headers = new Headers(originalRequest.headers);
    headers.set("X-User-Auth", JSON.stringify(authPayload));

    return new Request(originalRequest.url, {
      method: originalRequest.method,
      headers,
      body: originalRequest.body,
    });
  }

  /**
   * Handle agent authentication for initial message retrieval vs message processing
   * This allows initial message retrieval without auth but requires auth for processing
   */
  static async handleAgentAuthentication(
    username: string | null,
    hasUserMessages: boolean,
    db: D1Database,
    cache: {
      getCachedKey(): string | null;
      setCachedKey(key: string): Promise<void>;
      clearCachedKey(): Promise<void>;
    }
  ): Promise<{
    shouldProceed: boolean;
    apiKey: string | null;
    requiresAuth: boolean;
  }> {
    // For initial message retrieval, allow the request to proceed without authentication
    if (!username) {
      console.log(
        "[AuthService] No username found for initial message retrieval, allowing request to proceed"
      );
      return { shouldProceed: true, apiKey: null, requiresAuth: false };
    }

    const apiKey = await AuthService.loadUserOpenAIKeyWithCache(
      username,
      db,
      cache
    );

    // If no API key and we have user messages, require authentication
    if (!apiKey && hasUserMessages) {
      console.log(
        "[AuthService] No OpenAI API key found for message processing, requiring authentication"
      );
      return { shouldProceed: false, apiKey: null, requiresAuth: true };
    }

    return { shouldProceed: true, apiKey, requiresAuth: false };
  }
}

// Export static methods for backward compatibility
export const authenticatedFetchWithExpiration =
  AuthService.authenticatedFetchWithExpiration;
export const getStoredJwt = AuthService.getStoredJwt;
export const isJwtExpired = AuthService.isJwtExpired;
export const createAuthHeadersFromStorage =
  AuthService.createAuthHeadersFromStorage;
export const createAuthHeaders = AuthService.createAuthHeaders;
export const extractAuthFromHeader = AuthService.extractAuthFromHeader;
export const clearJwt = AuthService.clearJwt;
export const storeJwt = AuthService.storeJwt;
