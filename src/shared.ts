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

// Helper function to get API URL from environment variables
function getApiUrl(env?: any): string {
  // For internal API calls (tools calling the same Worker), use the environment variable
  // This allows configuration via .vars file for production

  // First try to get from env object (production/worker environment)
  if (env?.VITE_API_URL && typeof env.VITE_API_URL === "string") {
    return env.VITE_API_URL;
  }

  // Then try to get from process.env (Node.js environment)
  if (
    typeof process !== "undefined" &&
    process.env?.VITE_API_URL &&
    process.env.VITE_API_URL !== "undefined"
  ) {
    return process.env.VITE_API_URL;
  }

  // For browser environment, try to get from window or use fallback
  if (typeof window !== "undefined") {
    // In development, the API runs on a different port than the client
    if (
      window.location.hostname === "localhost" &&
      window.location.port === "5173"
    ) {
      return "http://localhost:8787";
    }
    // In production, use the same origin
    return window.location.origin;
  }

  // Fallback for development or when environment variable is not set
  return "https://ofisk.tech";
}

// API Configuration - centralized base URL and endpoints
export const API_CONFIG = {
  // Helper function to get the base URL dynamically
  getApiBaseUrl: (env?: any): string => {
    return getApiUrl(env);
  },

  // Helper function to build full API URLs
  buildUrl: (endpoint: string, env?: any): string => {
    return `${API_CONFIG.getApiBaseUrl(env)}${endpoint}`;
  },

  // Helper function to build campaign-specific URLs
  buildCampaignUrl: (
    campaignId: string,
    endpoint: string,
    env?: any
  ): string => {
    return API_CONFIG.buildUrl(`/campaigns/${campaignId}${endpoint}`, env);
  },

  // API endpoints without /api/ prefix
  ENDPOINTS: {
    CAMPAIGNS: {
      BASE: "/campaigns",
      LIST: "/campaigns",
      CREATE: "/campaigns",
      DETAILS: (campaignId: string) => `/campaigns/${campaignId}`,
      DELETE: (campaignId: string) => `/campaigns/${campaignId}`,
      DELETE_ALL: "/campaigns",
      RESOURCES: (campaignId: string) => `/campaigns/${campaignId}/resources`,
      RESOURCE: (campaignId: string) => `/campaigns/${campaignId}/resource`,
      RESOURCE_DELETE: (campaignId: string, resourceId: string) =>
        `/campaigns/${campaignId}/resource/${resourceId}`,
      CONTEXT: (campaignId: string) => `/campaigns/${campaignId}/context`,
      CHARACTERS: (campaignId: string) => `/campaigns/${campaignId}/characters`,
      SUGGESTIONS: (campaignId: string) =>
        `/campaigns/${campaignId}/suggestions`,
      READINESS: (campaignId: string) => `/campaigns/${campaignId}/readiness`,
      CONTEXT_SEARCH: (campaignId: string) =>
        `/campaigns/${campaignId}/context-search`,
    },
    CHARACTER_SHEETS: {
      //TODO: character sheets are just files and can be added to campaign context in a generic way (probably). reassess and consider removing
      UPLOAD_URL: "/character-sheets/upload-url",
      PROCESS: (characterSheetId: string) =>
        `/character-sheets/${characterSheetId}/process`,
      LIST: (campaignId: string) => `/campaigns/${campaignId}/character-sheets`,
      DETAILS: (characterSheetId: string) =>
        `/character-sheets/${characterSheetId}`,
    },
    AUTH: {
      AUTHENTICATE: "/authenticate",
      LOGOUT: "/logout",
      GET_OPENAI_KEY: "/get-openai-key",
      STORE_OPENAI_KEY: "/store-openai-key",
      DELETE_OPENAI_KEY: "/delete-openai-key",
    },
    CHAT: {
      SET_OPENAI_KEY: "/chat/set-openai-key",
    },
    OPENAI: {
      CHECK_KEY: "/check-open-ai-key",
      CHECK_USER_KEY: "/check-user-openai-key",
    },
    RAG: {
      SEARCH: "/rag/search",
      PROCESS_FILE: "/rag/process-file",
      PROCESS_FILE_FROM_R2: "/rag/process-file-from-r2",
      FILES: "/rag/files",
      FILE_CHUNKS: (fileKey: string) => `/rag/files/${fileKey}/chunks`,
      DELETE_FILE: (fileKey: string) => `/rag/files/${fileKey}`,
      TRIGGER_INDEXING: "/rag/trigger-indexing",
      STATUS: "/rag/status",
    },
    LIBRARY: {
      // Library routes (mounted at /library) - these are full paths including the mount point
      FILES: "/library/files",
      SEARCH: "/library/search",
      FILE_DETAILS: (fileId: string) => `/library/files/${fileId}`,
      FILE_UPDATE: (fileId: string) => `/library/files/${fileId}`,
      FILE_DELETE: (fileId: string) => `/library/files/${fileId}`,
      FILE_DOWNLOAD: (fileId: string) => `/library/files/${fileId}/download`,
      FILE_REGENERATE: (fileId: string) =>
        `/library/files/${fileId}/regenerate`,
      STORAGE_USAGE: "/library/storage-usage",

      // Route patterns for parameterized routes (these are used internally by the server)
      FILE_DETAILS_PATTERN: "/library/:fileId",
      FILE_UPDATE_PATTERN: "/library/:fileId",
      FILE_DELETE_PATTERN: "/library/:fileId",
      FILE_DOWNLOAD_PATTERN: "/library/:fileId/download",
      FILE_REGENERATE_PATTERN: "/library/:fileId/regenerate",

      // File management routes (mounted at /library) - consolidated here
      PROCESS: "/library/process",
      STATUS: "/library/status",
      AUTO_GENERATE_METADATA: "/library/auto-generate-metadata",
      PROCESS_METADATA_BACKGROUND: "/library/process-metadata-background",
      STATS: "/library/stats",
      FILE: (fileId: string) => `/library/files/${fileId}`,

      // Consolidated file management endpoints
      UPDATE_METADATA: (fileKey: string) =>
        `/library/files/${fileKey}/metadata`,

      // Consolidated upload endpoints
      UPLOAD_START: "/library/upload/start",
      UPLOAD_PART: "/library/upload/part",
      UPLOAD_COMPLETE: "/library/upload/complete",
      UPLOAD_PROGRESS: (sessionId: string) =>
        `/library/upload/progress/${sessionId}`,
      UPLOAD_SESSION: (sessionId: string) =>
        `/library/upload/session/${sessionId}`,
    },
    PROGRESS: {
      WEBSOCKET: "/progress",
    },
    ASSESSMENT: {
      USER_STATE: "/assessment/user-state",
      USER_ACTIVITY: "/assessment/user-activity",
      MODULE_INTEGRATION: "/assessment/module-integration",
      CAMPAIGN_HEALTH: (campaignId: string) =>
        `/assessment/campaign-health/${campaignId}`,
    },
    ONBOARDING: {
      NEXT_ACTIONS: "/onboarding/next-actions",
      WELCOME_GUIDANCE: "/onboarding/welcome-guidance",
      CAMPAIGN_GUIDANCE: (campaignId: string) =>
        `/onboarding/campaign-guidance/${campaignId}`,
    },
    EXTERNAL_RESOURCES: {
      RECOMMENDATIONS: "/external-resources/recommendations",
      INSPIRATION_SOURCES: "/external-resources/inspiration-sources",
      GM_RESOURCES: "/external-resources/gm-resources",
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
  toolCallId: string;
  result: {
    success: boolean;
    message: string;
    data?: unknown;
  };
}
