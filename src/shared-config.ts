// Approval string to be shared across frontend and backend
export const APPROVAL = {
	YES: "Yes, confirmed.",
	NO: "No, denied.",
} as const;

// Authentication response codes
export const AUTH_CODES = {
	SUCCESS: 200,
	INVALID_KEY: 401,
	SESSION_NOT_AUTHENTICATED: 403,
	ERROR: 500,
} as const;

/** Default app origin when APP_ORIGIN env is not set (e.g. local dev) */
export const DEFAULT_APP_ORIGIN = "http://localhost:5173";

/** Origins allowed as OAuth return_url / redirect targets (Google sign-in, etc.) */
export const ALLOWED_RETURN_ORIGINS: readonly string[] = [
	"http://localhost:5173",
	"http://localhost:5174",
	"http://localhost:3000",
	"http://localhost:8787",
	"https://loresmith.ai",
	"http://loresmith.ai",
	"https://www.loresmith.ai",
	"http://www.loresmith.ai",
	"https://loresmith-ai-dev.oren-t-fisk.workers.dev",
];

/** Google OAuth endpoints */
export const GOOGLE_OAUTH_URLS = {
	AUTH: "https://accounts.google.com/o/oauth2/v2/auth",
	TOKEN: "https://oauth2.googleapis.com/token",
	USERINFO: "https://www.googleapis.com/oauth2/v2/userinfo",
} as const;

// Helper function to get API URL from environment variables
function getApiUrl(env?: any): string {
	// For internal API calls (tools calling the same Worker), use the environment variable
	// This allows configuration via .vars file for production

	// First try to get from env object (production/worker environment)
	if (env?.VITE_API_URL && typeof env.VITE_API_URL === "string") {
		return env.VITE_API_URL;
	}

	// For browser environment, use import.meta.env (Vite environment variables)
	if (typeof window !== "undefined" && typeof import.meta !== "undefined") {
		// Try to get from Vite environment variables first
		if (
			import.meta.env?.VITE_API_URL &&
			import.meta.env.VITE_API_URL !== "undefined"
		) {
			return import.meta.env.VITE_API_URL;
		}

		// In development, the API runs on a different port than the client
		// Only use localhost:8787 if we're actually in development mode (Vite dev server)
		if (
			window.location.hostname === "localhost" &&
			window.location.port === "5173" &&
			import.meta.env?.DEV === true
		) {
			return "http://localhost:8787";
		}
		// In production, use the same origin
		return window.location.origin;
	}

	// Then try to get from process.env (Node.js environment)
	if (
		typeof process !== "undefined" &&
		process?.env?.VITE_API_URL &&
		process.env.VITE_API_URL !== "undefined"
	) {
		return process.env.VITE_API_URL;
	}

	// Fallback for development or when environment variable is not set
	return "https://loresmith.ai";
}

import { ENDPOINTS } from "@/routes/endpoints";

// API Configuration - centralized base URL and endpoints
export const API_CONFIG = {
	/** Origin only (e.g. https://loresmith.ai) - for /auth/* OAuth routes that live at root */
	getOrigin: (env?: any): string => getApiUrl(env),

	/** Base URL for API routes - includes /api (e.g. https://loresmith.ai/api) */
	getApiBaseUrl: (env?: any): string => {
		return `${getApiUrl(env)}/api`;
	},

	/** Build full URL for API endpoints (uses getApiBaseUrl, so endpoint paths omit /api) */
	buildUrl: (endpoint: string, env?: any): string => {
		return `${API_CONFIG.getApiBaseUrl(env)}${endpoint}`;
	},

	/** Build full URL for /auth/* routes (OAuth, verify-email, etc.) - these live at origin, not under /api */
	buildAuthUrl: (endpoint: string, env?: any): string => {
		return `${API_CONFIG.getOrigin(env)}${endpoint}`;
	},

	/** Build campaign-specific API URL */
	buildCampaignUrl: (
		campaignId: string,
		endpoint: string,
		env?: any
	): string => {
		return API_CONFIG.buildUrl(`/campaigns/${campaignId}${endpoint}`, env);
	},

	/** Route path for API endpoints (server uses this for registration; adds /api prefix) */
	apiRoute: (path: string): string =>
		`/api${path.startsWith("/") ? path : `/${path}`}`,

	/** API endpoint paths (relative to /api) - defined in @/routes/endpoints */
	ENDPOINTS,
} as const;

// Structured response types
export interface AuthResponse {
	code: number;
	message: string;
	authenticated: boolean;
	authenticatedAt?: string;
}

export interface ToolResult {
	toolCallId: string;
	result: {
		success: boolean;
		message: string;
		data?: unknown;
	};
}
