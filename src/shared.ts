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

// API Configuration - centralized base URL and endpoints
export const API_CONFIG = {
  // Use environment variable for API URL, fallback to localhost for development
  BASE_URL: import.meta.env.VITE_API_URL || "http://localhost:8787",

  // API endpoints without /api/ prefix
  ENDPOINTS: {
    CAMPAIGNS: {
      BASE: "/campaigns",
      RESOURCES: (campaignId: string) => `/campaigns/${campaignId}/resources`,
      RESOURCE: (campaignId: string) => `/campaigns/${campaignId}/resource`,
      DETAILS: (campaignId: string) => `/campaigns/${campaignId}`,
    },
    PDF: {
      AUTHENTICATE: "/pdf/authenticate",
      UPLOAD_URL: "/pdf/upload-url",
      UPLOAD: "/pdf/upload",
      INGEST: "/pdf/ingest",
      FILES: "/pdf/files",
      UPDATE_METADATA: "/pdf/update-metadata",
      STATS: "/pdf/stats",
    },
  },

  // Helper function to get the base URL
  getApiBaseUrl: (): string => {
    return import.meta.env.VITE_API_URL || "http://localhost:8787";
  },

  // Helper function to build full API URLs
  buildUrl: (endpoint: string): string => {
    return `${API_CONFIG.getApiBaseUrl()}${endpoint}`;
  },

  // Helper function to build campaign-specific URLs
  buildCampaignUrl: (campaignId: string, endpoint: string): string => {
    return API_CONFIG.buildUrl(`/campaigns/${campaignId}${endpoint}`);
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
