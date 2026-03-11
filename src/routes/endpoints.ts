/**
 * API endpoint paths (relative to /api).
 * Used by route registration and by client code via API_CONFIG.ENDPOINTS.
 */
export const ENDPOINTS = {
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
		ENTITY_EXTRACTION_STATUS: (campaignId: string, resourceId: string) =>
			`/campaigns/${campaignId}/resource/${resourceId}/entity-extraction-status`,
		CLEANUP_STUCK_ENTITY_EXTRACTION:
			"/campaigns/cleanup-stuck-entity-extraction",
		PROCESS_ENTITY_EXTRACTION_QUEUE:
			"/campaigns/process-entity-extraction-queue",
		CONTEXT: (campaignId: string) => `/campaigns/${campaignId}/context`,
		CHARACTERS: (campaignId: string) => `/campaigns/${campaignId}/characters`,
		SUGGESTIONS: (campaignId: string) => `/campaigns/${campaignId}/suggestions`,
		READINESS: (campaignId: string) => `/campaigns/${campaignId}/readiness`,
		CHECKLIST_STATUS: (campaignId: string) =>
			`/campaigns/${campaignId}/checklist-status`,
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
			GENERATE_FIELD: (campaignId: string, shardId: string) =>
				`/campaigns/${campaignId}/shards/${shardId}/generate-field`,
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
			TEST_EXTRACT_FROM_R2: "/test/entities/extract-from-r2",
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
		GRAPH_VISUALIZATION: {
			BASE: (campaignId: string) =>
				`/campaigns/${campaignId}/graph-visualization`,
			COMMUNITY: (campaignId: string, communityId: string) =>
				`/campaigns/${campaignId}/graph-visualization/community/${communityId}`,
			SEARCH_ENTITY: (campaignId: string) =>
				`/campaigns/${campaignId}/graph-visualization/search-entity`,
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
			BASE: (campaignId: string) => `/campaigns/${campaignId}/session-digests`,
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
		PLANNING_TASKS: {
			BASE: (campaignId: string) => `/campaigns/${campaignId}/planning-tasks`,
			DETAILS: (campaignId: string, taskId: string) =>
				`/campaigns/${campaignId}/planning-tasks/${taskId}`,
			COMPLETE_BULK: (campaignId: string) =>
				`/campaigns/${campaignId}/planning-tasks/complete-bulk`,
		},
		PLANNING_CONTEXT: {
			SEARCH: (campaignId: string) =>
				`/campaigns/${campaignId}/planning-context/search`,
			RECENT: (campaignId: string) =>
				`/campaigns/${campaignId}/planning-context/recent`,
		},
		CONTEXT_ASSEMBLY: (campaignId: string) =>
			`/campaigns/${campaignId}/context-assembly`,
		SHARE_LINKS: (campaignId: string) => `/campaigns/${campaignId}/share-links`,
		SHARE_LINKS_REVOKE: (campaignId: string, token: string) =>
			`/campaigns/${campaignId}/share-links/${encodeURIComponent(token)}`,
		SHARE_LINKS_REVOKE_PATTERN: "/campaigns/:campaignId/share-links/:token",
		JOIN: "/campaigns/join",
		PLAYER_CHARACTER_CLAIM_OPTIONS: (campaignId: string) =>
			`/campaigns/${campaignId}/player-character-claim/options`,
		PLAYER_CHARACTER_CLAIM: (campaignId: string) =>
			`/campaigns/${campaignId}/player-character-claim`,
		PLAYER_CHARACTER_CLAIMS: (campaignId: string) =>
			`/campaigns/${campaignId}/player-character-claims`,
		PLAYER_CHARACTER_CLAIM_ASSIGN: (campaignId: string, username: string) =>
			`/campaigns/${campaignId}/player-character-claims/${encodeURIComponent(username)}`,
		RESOURCE_PROPOSALS: (campaignId: string) =>
			`/campaigns/${campaignId}/resource-proposals`,
		RESOURCE_PROPOSAL_APPROVE: (campaignId: string, id: string) =>
			`/campaigns/${campaignId}/resource-proposals/${id}/approve`,
		RESOURCE_PROPOSAL_REJECT: (campaignId: string, id: string) =>
			`/campaigns/${campaignId}/resource-proposals/${id}/reject`,
		RESOURCE_PROPOSAL_DOWNLOAD: (campaignId: string, id: string) =>
			`/campaigns/${campaignId}/resource-proposals/${id}/download`,
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
		UPLOAD_URL: "/character-sheets/upload-url",
		PROCESS: (characterSheetId: string) =>
			`/character-sheets/${characterSheetId}/process`,
		LIST: (campaignId: string) => `/campaigns/${campaignId}/character-sheets`,
		DETAILS: (characterSheetId: string) =>
			`/character-sheets/${characterSheetId}`,
	},
	BILLING: {
		CHECKOUT: "/billing/checkout",
		CHECKOUT_CREDITS: "/billing/checkout-credits",
		CHANGE_PLAN: "/billing/change-plan",
		PORTAL: "/billing/portal",
		WEBHOOK: "/billing/webhook",
		STATUS: "/billing/status",
		QUOTA_STATUS: "/billing/quota-status",
		RETRY_LIMIT_STATUS: "/billing/retry-limit-status",
	},
	AUTH: {
		LOGOUT: "/auth/logout",
		GOOGLE: "/auth/google",
		GOOGLE_CALLBACK: "/auth/google/callback",
		GOOGLE_COMPLETE_SIGNUP: "/auth/google/complete-signup",
		REGISTER: "/auth/register",
		LOGIN: "/auth/login",
		VERIFY_EMAIL: "/auth/verify-email",
		RESEND_VERIFICATION: "/auth/resend-verification",
	},
	CHAT: {
		HISTORY: (sessionId: string) => `/chat-history/${sessionId}`,
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
		FILES: "/library/files",
		SEARCH: "/library/search",
		FILE_DETAILS: (fileId: string) => `/library/files/${fileId}`,
		FILE_UPDATE: (fileId: string) => `/library/files/${fileId}`,
		FILE_DELETE: (fileId: string) => `/library/files/${fileId}`,
		FILE_DOWNLOAD: (fileId: string) => `/library/files/${fileId}/download`,
		FILE_REGENERATE: (fileId: string) => `/library/files/${fileId}/regenerate`,
		STORAGE_USAGE: "/library/storage-usage",
		LLM_USAGE: "/library/llm-usage",
		FILE_DETAILS_PATTERN: "/library/:fileId",
		FILE_UPDATE_PATTERN: "/library/:fileId",
		FILE_DELETE_PATTERN: "/library/:fileId",
		FILE_DOWNLOAD_PATTERN: "/library/:fileId/download",
		FILE_REGENERATE_PATTERN: "/library/:fileId/regenerate",
		PROCESS: "/library/process",
		STATUS: "/library/status",
		AUTO_GENERATE_METADATA: "/library/auto-generate-metadata",
		PROCESS_METADATA_BACKGROUND: "/library/process-metadata-background",
		STATS: "/library/stats",
		FILE: (fileId: string) => `/library/files/${fileId}`,
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
		START_LARGE: "/upload/start-large",
		UPLOAD_PART: (sessionId: string, partNumber: string) =>
			`/upload/part/${sessionId}/${partNumber}`,
		COMPLETE_LARGE: (sessionId: string) =>
			`/upload/complete-large/${sessionId}`,
		PROGRESS: (sessionId: string) => `/upload/progress/${sessionId}`,
		ABORT_LARGE: (sessionId: string) => `/upload/abort-large/${sessionId}`,
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
		STREAM: "/notifications/stream",
		MINT_STREAM: "/notifications/mint-stream",
		PUBLISH: "/notifications/publish",
		STREAM_SUBSCRIBE: "/notifications/stream/subscribe",
	},
	TELEMETRY: {
		RATINGS: "/telemetry/ratings",
		CONTEXT_ACCURACY: "/telemetry/context-accuracy",
	},
	ADMIN: {
		TELEMETRY: {
			METRICS: "/admin/telemetry/metrics",
			DASHBOARD: "/admin/telemetry/dashboard",
			ALERTS: "/admin/telemetry/alerts",
		},
	},
} as const;
