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
      RETRY_ENTITY_EXTRACTION: (campaignId: string, resourceId: string) =>
        `/campaigns/${campaignId}/resource/${resourceId}/retry-entity-extraction`,
      CONTEXT: (campaignId: string) => `/campaigns/${campaignId}/context`,
      CHARACTERS: (campaignId: string) => `/campaigns/${campaignId}/characters`,
      SUGGESTIONS: (campaignId: string) =>
        `/campaigns/${campaignId}/suggestions`,
      READINESS: (campaignId: string) => `/campaigns/${campaignId}/readiness`,
      CAMPAIGN_GRAPHRAG: {
        APPROVE: (campaignId: string) =>
          `/campaigns/${campaignId}/graphrag/approve`,
        REJECT: (campaignId: string) =>
          `/campaigns/${campaignId}/graphrag/reject`,
        SEARCH: (campaignId: string) =>
          `/campaigns/${campaignId}/graphrag/search`,
        SEARCH_REJECTED: (campaignId: string) =>
          `/campaigns/${campaignId}/graphrag/search-rejected`,
        STAGED_SHARDS: (campaignId: string) =>
          `/campaigns/${campaignId}/shards/staged`,
        APPROVE_SHARDS: (campaignId: string) =>
          `/campaigns/${campaignId}/shards/approve`,
        REJECT_SHARDS: (campaignId: string) =>
          `/campaigns/${campaignId}/shards/reject`,
        UPDATE_SHARD: (campaignId: string, shardId: string) =>
          `/campaigns/${campaignId}/shards/${shardId}`,
        SEARCH_APPROVED: (campaignId: string) =>
          `/campaigns/${campaignId}/shards/approved`,
      },
      ENTITIES: {
        LIST: (campaignId: string) => `/campaigns/${campaignId}/entities`,
        DETAILS: (campaignId: string, entityId: string) =>
          `/campaigns/${campaignId}/entities/${entityId}`,
        RELATIONSHIPS: (campaignId: string, entityId: string) =>
          `/campaigns/${campaignId}/entities/${entityId}/relationships`,
        RELATIONSHIP_DETAIL: (
          campaignId: string,
          entityId: string,
          relationshipId: string
        ) =>
          `/campaigns/${campaignId}/entities/${entityId}/relationships/${relationshipId}`,
        RELATIONSHIP_TYPES: (campaignId: string) =>
          `/campaigns/${campaignId}/entities/relationship-types`,
        GRAPH_NEIGHBORS: (campaignId: string, entityId: string) =>
          `/campaigns/${campaignId}/entities/${entityId}/graph/neighbors`,
        IMPORTANCE: (campaignId: string, entityId: string) =>
          `/campaigns/${campaignId}/entities/${entityId}/importance`,
        IMPORTANCE_TOP: (campaignId: string) =>
          `/campaigns/${campaignId}/entities/importance/top`,
        EXTRACT: (campaignId: string) =>
          `/campaigns/${campaignId}/entities/extract`,
        DEDUPLICATE: (campaignId: string) =>
          `/campaigns/${campaignId}/entities/deduplicate`,
        DEDUP_PENDING: (campaignId: string) =>
          `/campaigns/${campaignId}/entities/deduplication-pending`,
        DEDUP_RESOLVE: (campaignId: string, entryId: string) =>
          `/campaigns/${campaignId}/entities/deduplication-pending/${entryId}`,
        TEST_EXTRACT_FROM_R2: "/api/test/entities/extract-from-r2",
      },
      COMMUNITIES: {
        DETECT: (campaignId: string) =>
          `/campaigns/${campaignId}/communities/detect`,
        LIST: (campaignId: string) => `/campaigns/${campaignId}/communities`,
        DETAILS: (campaignId: string, communityId: string) =>
          `/campaigns/${campaignId}/communities/${communityId}`,
        BY_LEVEL: (campaignId: string, level: string) =>
          `/campaigns/${campaignId}/communities/level/${level}`,
        CHILDREN: (campaignId: string, communityId: string) =>
          `/campaigns/${campaignId}/communities/${communityId}/children`,
        HIERARCHY: (campaignId: string) =>
          `/campaigns/${campaignId}/communities/hierarchy`,
        SUMMARY: (campaignId: string, communityId: string) =>
          `/campaigns/${campaignId}/communities/${communityId}/summary`,
        SUMMARIES: (campaignId: string) =>
          `/campaigns/${campaignId}/communities/summaries`,
        GENERATE_SUMMARY: (campaignId: string, communityId: string) =>
          `/campaigns/${campaignId}/communities/${communityId}/summaries/generate`,
      },
      WORLD_STATE: {
        CHANGELOG: (campaignId: string) =>
          `/campaigns/${campaignId}/world-state/changelog`,
        OVERLAY: (campaignId: string) =>
          `/campaigns/${campaignId}/world-state/overlay`,
        HISTORICAL_QUERY: (campaignId: string) =>
          `/campaigns/${campaignId}/world-state/historical/query`,
        HISTORICAL_OVERLAY: (campaignId: string) =>
          `/campaigns/${campaignId}/world-state/historical/overlay`,
      },
      SESSION_DIGESTS: {
        BASE: (campaignId: string) =>
          `/campaigns/${campaignId}/session-digests`,
        DETAILS: (campaignId: string, digestId: string) =>
          `/campaigns/${campaignId}/session-digests/${digestId}`,
        SUBMIT: (campaignId: string, digestId: string) =>
          `/campaigns/${campaignId}/session-digests/${digestId}/submit`,
        APPROVE: (campaignId: string, digestId: string) =>
          `/campaigns/${campaignId}/session-digests/${digestId}/approve`,
        REJECT: (campaignId: string, digestId: string) =>
          `/campaigns/${campaignId}/session-digests/${digestId}/reject`,
      },
      SESSION_DIGEST_TEMPLATES: {
        BASE: (campaignId: string) =>
          `/campaigns/${campaignId}/session-digest-templates`,
        DETAILS: (campaignId: string, templateId: string) =>
          `/campaigns/${campaignId}/session-digest-templates/${templateId}`,
      },
      PLANNING_CONTEXT: {
        SEARCH: (campaignId: string) =>
          `/campaigns/${campaignId}/planning-context/search`,
        RECENT: (campaignId: string) =>
          `/campaigns/${campaignId}/planning-context/recent`,
      },
      CONTEXT_ASSEMBLY: (campaignId: string) =>
        `/campaigns/${campaignId}/context-assembly`,
      GRAPH_REBUILD: {
        TRIGGER: (campaignId: string) =>
          `/campaigns/${campaignId}/graph-rebuild/trigger`,
        STATUS: (campaignId: string, rebuildId: string) =>
          `/campaigns/${campaignId}/graph-rebuild/status/${rebuildId}`,
        HISTORY: (campaignId: string) =>
          `/campaigns/${campaignId}/graph-rebuild/history`,
        ACTIVE: (campaignId: string) =>
          `/campaigns/${campaignId}/graph-rebuild/active`,
        CANCEL: (campaignId: string, rebuildId: string) =>
          `/campaigns/${campaignId}/graph-rebuild/cancel/${rebuildId}`,
      },
    },
    CHARACTER_SHEETS: {
      // NOTE: Character sheets are currently handled as a separate entity type.
      // Future consideration: Character sheets could be treated as regular files
      // and added to campaign context generically, which would simplify the API.
      // This would require migrating existing character sheet data and updating
      // the UI to handle them as regular campaign resources.
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
      FILES: "/rag/files",
      FILE_CHUNKS: (fileKey: string) => `/rag/files/${fileKey}/chunks`,
      DELETE_FILE: (fileKey: string) => `/rag/files/${fileKey}`,
      TRIGGER_INDEXING: "/rag/trigger-indexing",
      STATUS: "/rag/status",
      CHECK_FILE_INDEXING: "/rag/check-file-indexing",
      BULK_CHECK_FILE_INDEXING: "/rag/bulk-check-file-indexing",
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
        `/library/files/${encodeURIComponent(fileKey)}/metadata`,
      UPDATE_METADATA_PATTERN: "/library/files/:fileKey{.+}/metadata",
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
      CLEANUP_STUCK: "/upload/cleanup-stuck",
    },
    INGESTION: {
      STATUS: "/ingestion/status",
      HEALTH: "/ingestion/health",
      STATS: "/ingestion/stats",
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
    TELEMETRY: {
      RATINGS: "/api/telemetry/ratings",
      CONTEXT_ACCURACY: "/api/telemetry/context-accuracy",
    },
    ADMIN: {
      TELEMETRY: {
        METRICS: "/api/admin/telemetry/metrics",
        DASHBOARD: "/api/admin/telemetry/dashboard",
        ALERTS: "/api/admin/telemetry/alerts",
      },
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
