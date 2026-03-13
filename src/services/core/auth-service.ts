import type { JWTPayload } from "jose";
import { jwtVerify, SignJWT } from "jose";
import { ERROR_MESSAGES, JWT_STORAGE_KEY } from "@/app-constants";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import { extractJwtFromHeader } from "@/lib/auth-utils";
import { getEnvVar } from "@/lib/env-utils";
import { logger } from "@/lib/logger";
import { getAuthService } from "@/lib/service-factory";
import type { Env } from "@/middleware/auth";

export interface AuthPayload extends JWTPayload {
	type: "user-auth";
	username: string;
	isAdmin: boolean; // Added admin status
}

export interface AuthEnv {
	OPENAI_API_KEY?: unknown;
	JWT_SECRET?: string | { get(): Promise<string> };
	Chat: DurableObjectNamespace;
	GOOGLE_OAUTH_CLIENT_ID?: string | { get(): Promise<string> };
	GOOGLE_OAUTH_CLIENT_SECRET?: string | { get(): Promise<string> };
	RESEND_API_KEY?: string | { get(): Promise<string> };
	APP_ORIGIN?: string;
	VERIFICATION_EMAIL_FROM?: string;
}

export interface AuthRequest {
	username: string;
	sessionId?: string;
	isAdmin?: boolean;
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
		const secret = await getEnvVar(this.env, "JWT_SECRET");
		return new TextEncoder().encode(secret);
	}

	/**
	 * Authenticate a user and create a JWT token
	 */
	async authenticateUser(request: AuthRequest): Promise<AuthResponse> {
		const { username, isAdmin: requestIsAdmin } = request;

		// Validate required fields
		if (!username || typeof username !== "string" || username.trim() === "") {
			return {
				success: false,
				error: "Username is required",
			};
		}

		const isAdmin = requestIsAdmin === true;

		try {
			const secret = await this.getJwtSecret();

			const token = await new SignJWT({
				type: "user-auth",
				username,
				isAdmin, // Include admin status in JWT
			})
				.setProtectedHeader({ alg: "HS256" })
				.setIssuedAt()
				.setExpirationTime("24h")
				.sign(secret);

			return {
				success: true,
				token,
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error &&
					(error.name === "EnvironmentVariableError" ||
						/JWT_SECRET/i.test(error.message))
						? "Authentication is not configured on the server."
						: "Failed to create authentication token",
			};
		}
	}

	/**
	 * Extract and verify JWT from Authorization header
	 */
	async extractAuthFromHeader(
		authHeader: string | null | undefined
	): Promise<AuthPayload | null> {
		const token = extractJwtFromHeader(authHeader);
		if (!token) {
			return null;
		}

		try {
			const secret = await this.getJwtSecret();
			const { payload } = await jwtVerify(token, secret);

			if (payload.type !== "user-auth") {
				return null;
			}

			return payload as AuthPayload;
		} catch (_error) {
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

	/** Create a short-lived JWT for "choose username" after Google sign-in (no claim). */
	static async createGooglePendingToken(
		env: Env,
		payload: { email: string; sub: string }
	): Promise<string> {
		const authService = getAuthService(env);
		const secret = await authService.getJwtSecret();
		return new SignJWT({
			type: "google-pending",
			email: payload.email,
			sub: payload.sub,
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime("10m")
			.sign(secret);
	}

	/** Verify a Google pending token; returns payload or null. */
	static async verifyGooglePendingToken(
		env: Env,
		token: string
	): Promise<{ email: string; sub: string } | null> {
		try {
			const authService = getAuthService(env);
			const secret = await authService.getJwtSecret();
			const { payload } = await jwtVerify(token, secret);
			if (payload.type !== "google-pending" || !payload.email || !payload.sub) {
				return null;
			}
			return {
				email: String(payload.email),
				sub: String(payload.sub),
			};
		} catch {
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
		const log = logger.scope("[AuthService]");
		try {
			// JWT uses Base64URL encoding, need to handle it properly
			const parts = jwt.split(".");
			if (parts.length !== 3) {
				log.warn("Invalid JWT format - expected 3 parts");
				return true;
			}

			// Convert Base64URL to Base64 for atob
			const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
			const padded = base64 + "===".slice((base64.length + 3) % 4);

			const payload = JSON.parse(atob(padded));

			if (!payload.exp) {
				log.warn("JWT payload missing 'exp' claim");
				return true; // Consider expired if no expiration claim
			}

			// JWT exp is in seconds, convert to milliseconds for comparison
			const exp = payload.exp * 1000;
			const now = Date.now();
			const isExpired = now >= exp;

			if (isExpired) {
				log.debug("JWT expired", {
					exp: new Date(exp).toISOString(),
					now: new Date(now).toISOString(),
					secondsUntilExp: Math.floor((exp - now) / 1000),
				});
			}

			return isExpired;
		} catch (error) {
			log.error("Error checking JWT expiration", error, {
				jwtPreview: jwt.substring(0, 50),
			});
			return true; // Consider expired if we can't parse
		}
	}

	/**
	 * Handle JWT expiration
	 */
	handleJwtExpiration(): void {
		AuthService.clearJwt();
	}

	// Static helper methods that don't require instance creation
	static getStoredJwt(): string | null {
		if (typeof window === "undefined") return null;
		return localStorage.getItem(JWT_STORAGE_KEY);
	}

	static storeJwt(token: string): void {
		const log = logger.scope("[AuthService.storeJwt]");
		if (typeof window === "undefined") {
			log.warn("window is undefined, cannot store JWT");
			return;
		}
		log.debug("Storing JWT token", { length: token.length });
		localStorage.setItem(JWT_STORAGE_KEY, token);

		// Verify storage
		const stored = localStorage.getItem(JWT_STORAGE_KEY);
		if (stored !== token) {
			log.error("Failed to store JWT - storage mismatch!", undefined);
			return;
		}

		log.info("JWT stored successfully, dispatching jwt-changed event");
		// Dispatch custom event to notify hooks that JWT changed
		// This helps useAuthReady detect authentication immediately
		window.dispatchEvent(new CustomEvent(APP_EVENT_TYPE.JWT_CHANGED));
	}

	static clearJwt(): void {
		if (typeof window === "undefined") return;
		localStorage.removeItem(JWT_STORAGE_KEY);
		// Dispatch custom event to notify hooks that JWT was cleared
		window.dispatchEvent(new CustomEvent(APP_EVENT_TYPE.JWT_CHANGED));
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
			// Dispatch jwt-expired event to trigger auth modal
			if (typeof window !== "undefined") {
				window.dispatchEvent(
					new CustomEvent(APP_EVENT_TYPE.JWT_EXPIRED, {
						detail: {
							message: "Your session has expired. Please sign in again.",
						},
					})
				);
			}
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

	// JWT utilities

	/**
	 * Utility function to parse JWT and extract username.
	 * JWTs use base64url encoding; decode before atob.
	 */
	static parseJwtForUsername(jwt: string): string | null {
		try {
			const part = jwt.split(".")[1] || "";
			let base64 = part.replace(/-/g, "+").replace(/_/g, "/");
			const pad = base64.length % 4;
			if (pad) base64 += "=".repeat(4 - pad);
			const payload = JSON.parse(atob(base64));
			return payload.username || null;
		} catch (_error) {
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
		} catch (_error) {
			return null;
		}
	}

	/**
	 * Utility function to get full JWT payload from stored JWT
	 * This is useful for components that need more than just the username
	 */
	static getJwtPayload(): any | null {
		const log = logger.scope("[AuthService]");
		try {
			const jwt = AuthService.getStoredJwt();
			if (!jwt) {
				log.debug("No JWT found in storage");
				return null;
			}

			// JWT uses Base64URL encoding, need to handle it properly
			const parts = jwt.split(".");
			if (parts.length !== 3) {
				log.warn("Invalid JWT format - expected 3 parts");
				return null;
			}

			// Convert Base64URL to Base64 for atob
			const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
			const padded = base64 + "===".slice((base64.length + 3) % 4);

			const payload = JSON.parse(atob(padded));
			log.debug("Successfully parsed JWT payload", {
				hasUsername: !!payload.username,
				hasExp: !!payload.exp,
			});
			return payload;
		} catch (error) {
			log.error("Error getting JWT payload", error);
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
