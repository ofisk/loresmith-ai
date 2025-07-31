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
  private async getJwtSecret(): Promise<Uint8Array> {
    const secret = this.env.ADMIN_SECRET || "default-secret-key";
    return new TextEncoder().encode(secret);
  }

  /**
   * Authenticate a user and create a JWT token
   */
  async authenticateUser(request: AuthRequest): Promise<AuthResponse> {
    const { username, openaiApiKey, providedKey } = request;

    console.log("[AuthService] Starting authentication process");
    console.log("[AuthService] Request data:", {
      username: username ? `${username.substring(0, 10)}...` : "undefined",
      hasOpenAIKey: !!openaiApiKey,
      hasProvidedKey: !!providedKey,
      providedKeyLength: providedKey?.length || 0,
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
      !providedKey ||
      typeof providedKey !== "string" ||
      providedKey.trim() === ""
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
    const validAdminKey = this.env.ADMIN_SECRET || "undefined-admin-key";
    const isValidAdminKey = providedKey.trim() === validAdminKey;

    console.log("[AuthService] Admin key validation:", {
      providedKey: providedKey
        ? `${providedKey.substring(0, 4)}...`
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
    const jwt = this.getStoredJwt();
    return this.createAuthHeaders(jwt);
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
    this.clearJwt();
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

  // JWT Storage Methods (for client-side use)
  getStoredJwt(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("loresmith-jwt");
  }

  storeJwt(token: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem("loresmith-jwt", token);
  }

  clearJwt(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem("loresmith-jwt");
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
}
