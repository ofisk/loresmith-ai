// Approval string to be shared across frontend and backend
export const APPROVAL = {
  YES: "Yes, confirmed.",
  NO: "No, denied.",
} as const;

// AutoRAG configuration
export const AUTORAG_CONFIG = {
  LIBRARY_RAG_ID: "loresmith-library-autorag",
  buildLibraryAutoRAGUrl: (baseUrl: string, endpoint: string): string => {
    return `${baseUrl}${endpoint}`;
  },
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
    process?.env?.VITE_API_URL &&
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
  // Use the Worker URL instead of the domain that's not configured
  return "https://loresmith-ai.oren-t-fisk.workers.dev";
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
      CAMPAIGN_AUTORAG: {
        APPROVE: (campaignId: string) =>
          `/campaigns/${campaignId}/autorag/approve`,
        REJECT: (campaignId: string) =>
          `/campaigns/${campaignId}/autorag/reject`,
        SEARCH: (campaignId: string) =>
          `/campaigns/${campaignId}/autorag/search`,
        SEARCH_REJECTED: (campaignId: string) =>
          `/campaigns/${campaignId}/autorag/search-rejected`,
        STAGED_SHARDS: (campaignId: string) =>
          `/campaigns/${campaignId}/shards/staged`,
        APPROVE_SHARDS: (campaignId: string) =>
          `/campaigns/${campaignId}/shards/approve`,
        REJECT_SHARDS: (campaignId: string) =>
          `/campaigns/${campaignId}/shards/reject`,
        SEARCH_APPROVED: (campaignId: string) =>
          `/campaigns/${campaignId}/shards/approved`,
      },
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
    },
    PROGRESS: {
      WEBSOCKET: "/progress",
    },
    ASSESSMENT: {
      USER_STATE: "/assessment/user-state",
      USER_ACTIVITY: "/assessment/user-activity",
      MODULE_INTEGRATION: "/assessment/module-integration",
      CAMPAIGN_READINESS: (campaignId: string) =>
        `/assessment/campaign-readiness/${campaignId}`,
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
    UPLOAD: {
      DIRECT: (tenant: string, filename: string) =>
        `/upload/direct/${tenant}/${filename}`,
      STATUS: (tenant: string, filename: string) =>
        `/upload/status/${tenant}/${filename}`,

      // Large file upload endpoints
      START_LARGE: "/upload/start-large",
      UPLOAD_PART: (sessionId: string, partNumber: string) =>
        `/upload/part/${sessionId}/${partNumber}`,
      COMPLETE_LARGE: (sessionId: string) =>
        `/upload/complete-large/${sessionId}`,
      PROGRESS: (sessionId: string) => `/upload/progress/${sessionId}`,
      ABORT_LARGE: (sessionId: string) => `/upload/abort-large/${sessionId}`,
      // Upload session management endpoints
      SESSION_CREATE: "/upload/session/create",
      SESSION_GET: "/upload/session/get",
      SESSION_ADD_PART: "/upload/session/add-part",
      SESSION_GET_PARTS: "/upload/session/get-parts",
      SESSION_COMPLETE: "/upload/session/complete",
      SESSION_DELETE: "/upload/session/delete",
    },
    INGESTION: {
      STATUS: "/ingestion/status",
      HEALTH: "/ingestion/health",
      STATS: "/ingestion/stats",
    },
    AUTORAG: {
      SYNC: (ragId: string) => `/autorag/rags/${ragId}/sync`,
      JOB_DETAILS: (ragId: string, jobId: string) =>
        `/autorag/rags/${ragId}/jobs/${jobId}`,
      JOB_LOGS: (ragId: string, jobId: string) =>
        `/autorag/rags/${ragId}/jobs/${jobId}/logs`,
      JOBS: (ragId: string) => `/autorag/rags/${ragId}/jobs`,
      REFRESH_ALL_FILE_STATUSES: "/autorag/refresh-all-statuses",
      // AutoRAG API URL construction helpers
      API: {
        SEARCH: (
          accountId: string,
          ragName: string = "loresmith-library-autorag"
        ) =>
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/autorag/rags/${ragName}/search`,
        SYNC: (
          accountId: string,
          ragName: string = "loresmith-library-autorag"
        ) =>
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/autorag/rags/${ragName}/sync`,
        JOBS: (
          accountId: string,
          ragName: string = "loresmith-library-autorag"
        ) =>
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/autorag/rags/${ragName}/jobs`,
        JOB_DETAILS: (
          accountId: string,
          ragName: string = "loresmith-library-autorag",
          jobId: string
        ) =>
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/autorag/rags/${ragName}/jobs/${jobId}`,
        JOB_LOGS: (
          accountId: string,
          ragName: string = "loresmith-library-autorag",
          jobId: string
        ) =>
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/autorag/rags/${ragName}/jobs/${jobId}/logs`,
      },
    },
    FILE_ANALYSIS: {
      BASE: "/file-analysis",
      ANALYZE: (fileKey: string) => `/file-analysis/analyze/${fileKey}`,
      STATUS: (fileKey: string) => `/file-analysis/status/${fileKey}`,
      PENDING: "/file-analysis/pending",
      RECOMMENDATIONS: "/file-analysis/recommendations",
      ANALYZE_ALL: "/file-analysis/analyze-all",
    },
    NOTIFICATIONS: {
      STREAM: "/api/notifications/stream",
      MINT_STREAM: "/api/notifications/mint-stream",
      PUBLISH: "/api/notifications/publish",
      STREAM_SUBSCRIBE: "/api/notifications/stream/subscribe",
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
