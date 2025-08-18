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
function getApiUrl(): string {
  console.log("[getApiUrl] Starting URL resolution");

  // Try Vite environment (for frontend development)
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_API_URL &&
    import.meta.env.VITE_API_URL !== "undefined"
  ) {
    console.log(
      "[getApiUrl] Using Vite environment URL:",
      import.meta.env.VITE_API_URL
    );
    return import.meta.env.VITE_API_URL;
  }

  // Try process.env (for Worker context)
  if (
    typeof process !== "undefined" &&
    process.env?.VITE_API_URL &&
    process.env.VITE_API_URL !== "undefined"
  ) {
    console.log("[getApiUrl] Using process.env URL:", process.env.VITE_API_URL);
    return process.env.VITE_API_URL;
  }

  // Fallback - this should never happen with proper .vars files
  console.log("[getApiUrl] No environment variable found, using fallback");
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
      UPDATE_METADATA: (fileKey: string) => `/rag/files/${fileKey}/metadata`,
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
      UPLOAD_URL: "/library/upload-url",
      UPLOAD_COMPLETE: "/library/upload/complete",
      UPLOAD_PART: "/library/upload/part",
      PROCESS: "/library/process",
      STATUS: "/library/status",
      UPDATE_METADATA: "/library/update-metadata",
      AUTO_GENERATE_METADATA: "/library/auto-generate-metadata",
      PROCESS_METADATA_BACKGROUND: "/library/process-metadata-background",
      STATS: "/library/stats",
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
