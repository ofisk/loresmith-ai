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

// Helper function to get API URL that works in both Vite and Worker contexts
function getApiUrl(): string {
  console.log("[getApiUrl] Starting URL resolution");

  // Try Vite environment first (for frontend)
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
    console.log(
      "[getApiUrl] Using Vite environment URL:",
      import.meta.env.VITE_API_URL
    );
    return import.meta.env.VITE_API_URL;
  }
  // Fallback to process.env (for Worker context)
  if (typeof process !== "undefined" && process.env?.VITE_API_URL) {
    console.log("[getApiUrl] Using process.env URL:", process.env.VITE_API_URL);
    return process.env.VITE_API_URL;
  }

  // In production (browser context), use the current origin
  if (typeof window !== "undefined" && window.location) {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port;

    console.log("[getApiUrl] Browser context detected:", {
      hostname,
      protocol,
      port,
      origin: window.location.origin,
      href: window.location.href,
    });

    // If we're not on localhost, use the current origin
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      console.log(
        "[getApiUrl] Using production origin:",
        window.location.origin
      );
      return window.location.origin;
    }

    // If we are on localhost, always use localhost:8787 for the API
    console.log("[getApiUrl] Using localhost API URL");
    return "http://localhost:8787";
  }

  // If we reach here, we're not in a browser context
  console.log("[getApiUrl] Not in browser context, using default fallback");

  // For Worker context, detect if we're running on Cloudflare Workers
  // In Cloudflare Workers, we can detect production by checking if we're not in a browser context
  // and if we have access to Cloudflare-specific globals
  if (typeof window === "undefined" && typeof globalThis !== "undefined") {
    // Check if we're in a Cloudflare Worker environment
    const isCloudflareWorker =
      typeof globalThis.fetch === "function" &&
      typeof globalThis.Response === "function" &&
      typeof globalThis.Request === "function";

    if (isCloudflareWorker) {
      console.log(
        "[getApiUrl] Detected Cloudflare Worker environment, using production URL"
      );
      return "https://loresmith-ai.oren-t-fisk.workers.dev";
    }
  }

  // Default fallback for development
  console.log("[getApiUrl] Using default localhost fallback");
  return "http://localhost:8787";
}

// API Configuration - centralized base URL and endpoints
export const API_CONFIG = {
  // Helper function to get the base URL dynamically
  getApiBaseUrl: (): string => {
    return getApiUrl();
  },

  // Helper function to build full API URLs
  buildUrl: (endpoint: string): string => {
    return `${API_CONFIG.getApiBaseUrl()}${endpoint}`;
  },

  // Helper function to build campaign-specific URLs
  buildCampaignUrl: (campaignId: string, endpoint: string): string => {
    return API_CONFIG.buildUrl(`/campaigns/${campaignId}${endpoint}`);
  },

  // API endpoints without /api/ prefix
  ENDPOINTS: {
    CAMPAIGNS: {
      BASE: "/campaigns",
      RESOURCES: (campaignId: string) => `/campaigns/${campaignId}/resources`,
      RESOURCE: (campaignId: string) => `/campaigns/${campaignId}/resource`,
      DETAILS: (campaignId: string) => `/campaigns/${campaignId}`,
      CONTEXT: (campaignId: string) => `/campaigns/${campaignId}/context`,
      CHARACTERS: (campaignId: string) => `/campaigns/${campaignId}/characters`,
      SUGGESTIONS: (campaignId: string) =>
        `/campaigns/${campaignId}/suggestions`,
      READINESS: (campaignId: string) => `/campaigns/${campaignId}/readiness`,
      CONTEXT_SEARCH: (campaignId: string) =>
        `/campaigns/${campaignId}/context-search`,
    },
    CHARACTER_SHEETS: {
      UPLOAD_URL: "/character-sheets/upload-url",
      PROCESS: (characterSheetId: string) =>
        `/character-sheets/${characterSheetId}/process`,
      LIST: (campaignId: string) => `/campaigns/${campaignId}/character-sheets`,
      DETAILS: (characterSheetId: string) =>
        `/character-sheets/${characterSheetId}`,
    },
    AUTH: {
      AUTHENTICATE: "/auth/authenticate",
    },
    CHAT: {
      SET_OPENAI_KEY: "/chat/set-openai-key",
    },
    OPENAI: {
      CHECK_KEY: "/check-open-ai-key",
      CHECK_USER_KEY: "/check-user-openai-key",
    },
    PDF: {
      UPLOAD_URL: "/pdf/upload-url",
      UPLOAD: "/pdf/upload",
      INGEST: "/pdf/ingest",
      FILES: "/pdf/files",
      UPDATE_METADATA: "/pdf/update-metadata",
      AUTO_GENERATE_METADATA: "/pdf/auto-generate-metadata",
      STATS: "/pdf/stats",
    },
    RAG: {
      SEARCH: "/rag/search",
      PROCESS_PDF: "/rag/process-pdf",
      PROCESS_PDF_FROM_R2: "/rag/process-pdf-from-r2",
      PDFS: "/rag/pdfs",
      PDF_CHUNKS: (fileKey: string) => `/rag/pdfs/${fileKey}/chunks`,
      UPDATE_METADATA: (fileKey: string) => `/rag/pdfs/${fileKey}/metadata`,
      DELETE_PDF: (fileKey: string) => `/rag/pdfs/${fileKey}`,
    },
  },
} as const;

// Structured response types
export interface AuthResponse {
  code: number;
  message: string;
  authenticated: boolean;
  authenticatedAt?: string;
}

export interface ToolResult {
  code: number;
  message: string;
  data?: unknown;
}
