import type { JWTPayload } from "jose";
import { jwtVerify, SignJWT } from "jose";
import { ERROR_MESSAGES } from "../constants";

export interface AuthPayload extends JWTPayload {
  type: "user-auth";
  username: string;
  openaiApiKey?: string;
}

export interface AuthEnv {
  OPENAI_API_KEY?: string;
  ADMIN_SECRET?: any; // JsRpcPromise from Secrets Store
  Chat: DurableObjectNamespace;
}

export interface AuthRequest {
  username: string;
  openaiApiKey?: string;
  adminSecret: string;
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
  constructor(private env: AuthEnv) {}

  /**
   * Get JWT secret from environment
   */
  async getJwtSecret(): Promise<Uint8Array> {
    // Get secret from local dev vars or Cloudflare secrets store
    let secret: string;

    if (typeof this.env.ADMIN_SECRET === "string") {
      // Local development: direct string from .dev.vars
      secret = this.env.ADMIN_SECRET;
    } else if (
      this.env.ADMIN_SECRET &&
      typeof this.env.ADMIN_SECRET.get === "function"
    ) {
      // Production: Cloudflare secrets store
      secret = await this.env.ADMIN_SECRET.get();
    } else {
      // Fallback
      secret = "default-secret-key";
    }

    console.log("[AuthService] JWT secret source:", {
      hasEnvSecret: !!this.env.ADMIN_SECRET,
      secretType: typeof this.env.ADMIN_SECRET,
      secretLength: secret.length,
      secretPrefix: secret.substring(0, 10) + "...",
      encodedLength: new TextEncoder().encode(secret).length,
    });
    return new TextEncoder().encode(secret);
  }

  /**
   * Authenticate a user and create a JWT token
   */
  async authenticateUser(request: AuthRequest): Promise<AuthResponse> {
    const { username, openaiApiKey, adminSecret } = request;

    console.log("[AuthService] Starting authentication process");
    console.log("[AuthService] Request data:", {
      username: username ? `${username.substring(0, 10)}...` : "undefined",
      hasOpenAIKey: !!openaiApiKey,
      hasAdminSecret: !!adminSecret,
      adminSecretLength: adminSecret?.length || 0,
    });

    // Validate required fields
    if (!username || typeof username !== "string" || username.trim() === "") {
      console.log("[AuthService] Username validation failed");
      return {
        success: false,
        error: "Username is required",
      };
    }

    if (
      !adminSecret ||
      typeof adminSecret !== "string" ||
      adminSecret.trim() === ""
    ) {
      console.log(
        "[AuthService] Admin key validation failed - missing or empty"
      );
      return {
        success: false,
        error: "Admin key is required",
      };
    }

    // Simple access control: check if admin key is valid
    let validAdminKey: string;

    if (typeof this.env.ADMIN_SECRET === "string") {
      // Local development: direct string from .dev.vars
      validAdminKey = this.env.ADMIN_SECRET;
    } else if (
      this.env.ADMIN_SECRET &&
      typeof this.env.ADMIN_SECRET.get === "function"
    ) {
      // Production: Cloudflare secrets store
      validAdminKey = await this.env.ADMIN_SECRET.get();
    } else {
      // Fallback
      validAdminKey = "undefined-admin-key";
    }

    const isValidAdminKey = adminSecret.trim() === validAdminKey;

    console.log("[AuthService] Admin key validation:", {
      adminSecret: adminSecret
        ? `${adminSecret.substring(0, 4)}...`
        : "undefined",
      validAdminKey: validAdminKey
        ? `${validAdminKey.substring(0, 4)}...`
        : "undefined",
      isValid: isValidAdminKey,
    });

    if (!isValidAdminKey) {
      console.log("[AuthService] Admin key validation failed");
      return {
        success: false,
        error: "Invalid admin key",
      };
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
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("24h")
        .sign(secret);

      console.log(
        "[AuthService] Authentication successful for user:",
        username
      );
      console.log("[AuthService] JWT token created successfully");

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
  createAuthHeaders(jwt?: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (jwt) {
      headers.Authorization = `Bearer ${jwt}`;
    }

    return headers;
  }

  /**
   * Create authentication headers from stored JWT
   */
  createAuthHeadersFromStorage(): Record<string, string> {
    const jwt = AuthService.getStoredJwt();
    return AuthService.createAuthHeaders(jwt);
  }

  /**
   * Check if JWT is expired
   */
  isJwtExpired(jwt: string): boolean {
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
    return localStorage.getItem("loresmith-jwt");
  }

  static storeJwt(token: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem("loresmith-jwt", token);
  }

  static clearJwt(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem("loresmith-jwt");
  }

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

  static createAuthHeaders(jwt?: string | null): Record<string, string> {
    return {
      Authorization: jwt ? `Bearer ${jwt}` : "",
      "Content-Type": "application/json",
    };
  }

  static createAuthHeadersFromStorage(): Record<string, string> {
    const jwt = AuthService.getStoredJwt();
    return AuthService.createAuthHeaders(jwt);
  }

  static async extractAuthFromHeader(
    authHeader: string | null | undefined,
    env: any
  ): Promise<AuthPayload | null> {
    const authService = new AuthService(env);
    return authService.extractAuthFromHeader(authHeader);
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
   * Make authenticated fetch request with JWT expiration handling
   */
  async authenticatedFetchWithExpiration(
    url: string,
    options: RequestInit & { jwt?: string | null } = {}
  ): Promise<{ response: Response; jwtExpired: boolean }> {
    const { jwt, ...fetchOptions } = options;
    const headers = this.createAuthHeaders(jwt);

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
      headers: this.createAuthHeaders(jwt),
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
      const result = await db
        .prepare(`SELECT api_key FROM user_openai_keys WHERE username = ?`)
        .bind(username)
        .first();

      return (result as any)?.api_key || null;
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
