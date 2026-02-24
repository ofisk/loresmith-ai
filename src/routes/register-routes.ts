import type { Context, Hono } from "hono";
import {
  handleGetAssessmentRecommendations,
  handleGetUserActivity,
  handleGetUserState,
  handleModuleIntegration,
} from "@/routes/assessment";
import {
  handleAuthenticate,
  handleCheckOpenAIKey,
  handleCheckUserOpenAIKey,
  handleDeleteOpenAIKey,
  handleGetOpenAIKey,
  handleGoogleAuth,
  handleGoogleCallback,
  handleGoogleCompleteSignup,
  handleLogin,
  handleLogout,
  handleRegister,
  handleResendVerification,
  handleSetOpenAIApiKey,
  handleStoreOpenAIKey,
  handleVerifyEmail,
  optionalUserJwt,
  requireUserJwt,
} from "@/routes/auth";
import {
  handleApproveShards,
  handleGetStagedShards,
  handleRejectShards,
  handleUpdateShard,
  handleGenerateShardField,
} from "@/routes/campaign-graphrag";
import {
  handleAddResourceToCampaign,
  handleCreateCampaign,
  handleDeleteAllCampaigns,
  handleDeleteCampaign,
  handleGetCampaign,
  handleGetCampaignResources,
  handleGetCampaigns,
  handleGetChecklistStatus,
  handleRemoveResourceFromCampaign,
  handleRetryEntityExtraction,
  handleGetEntityExtractionStatus,
  handleCleanupStuckEntityExtraction,
  handleProcessEntityExtractionQueue,
  handleUpdateCampaign,
} from "@/routes/campaigns";
import {
  handleCreateShareLink,
  handleListShareLinks,
  handleRevokeShareLink,
  handleCampaignJoin,
} from "@/routes/campaign-share";
import {
  handleCreateResourceProposal,
  handleListResourceProposals,
  handleApproveResourceProposal,
  handleRejectResourceProposal,
  handleDownloadFileFromProposal,
} from "@/routes/campaign-resource-proposals";
import {
  handleGetEntity,
  handleGetEntityRelationships,
  handleGetEntityNeighbors,
  handleListEntities,
  handleListRelationshipTypes,
  handleTriggerEntityDeduplication,
  handleTriggerEntityExtraction,
  handleListPendingDeduplication,
  handleResolveDeduplicationEntry,
  handleTestEntityExtractionFromR2,
  handleCreateEntityRelationship,
  handleDeleteEntityRelationship,
  handleUpdateEntityImportance,
  handleGetEntityImportance,
  handleListTopEntitiesByImportance,
} from "@/routes/entities";
import {
  handleDetectCommunities,
  handleListCommunities,
  handleGetCommunitySummary,
  handleListCommunitySummaries,
  handleGenerateCommunitySummary,
  handleGetCommunity,
  handleGetCommunitiesByLevel,
  handleGetChildCommunities,
  handleGetCommunityHierarchy,
} from "@/routes/communities";
import {
  handleGetGraphVisualization,
  handleGetCommunityEntityGraph,
  handleSearchEntityInGraph,
} from "@/routes/graph-visualization";
import {
  handleCreateWorldStateChangelog,
  handleGetWorldStateOverlay,
  handleListWorldStateChangelog,
  handleQueryHistoricalState,
  handleGetHistoricalOverlay,
} from "@/routes/world-state";
import {
  handleCreateSessionDigest,
  handleGetSessionDigest,
  handleGetSessionDigests,
  handleUpdateSessionDigest,
  handleDeleteSessionDigest,
  handleSubmitDigestForReview,
  handleApproveDigest,
  handleRejectDigest,
} from "@/routes/session-digests";
import {
  handleCreateSessionDigestTemplate,
  handleGetSessionDigestTemplate,
  handleGetSessionDigestTemplates,
  handleUpdateSessionDigestTemplate,
  handleDeleteSessionDigestTemplate,
} from "@/routes/session-digest-templates";
import {
  handleSearchPlanningContext,
  handleGetRecentPlanningContext,
} from "@/routes/planning-context";
import { handleAssembleContext } from "@/routes/context-assembly";
import {
  handleTriggerRebuild,
  handleGetRebuildStatus,
  handleGetRebuildHistory,
  handleGetActiveRebuilds,
  handleCancelRebuild,
} from "@/routes/graph-rebuild";
import {
  handleGetExternalResourceRecommendations,
  handleGetExternalResourceSearch,
  handleGetGmResources,
} from "@/routes/external-resources";
import {
  handleRecordSatisfactionRating,
  handleRecordContextAccuracy,
  handleGetMetrics,
  handleGetDashboard,
  handleGetAlerts,
} from "@/routes/telemetry";
import fileAnalysisRoutes from "@/routes/file-analysis";
import {
  handleDeleteFile,
  handleGetFileDetails,
  handleGetFileDownload,
  handleGetStorageUsage,
  handleRegenerateFileMetadata,
  handleSearchFiles,
  handleUpdateFile,
} from "@/routes/library";
import {
  handleMintStreamToken,
  handleNotificationPublish,
  handleNotificationStream,
} from "@/routes/notifications";
import {
  handleGetNextActions,
  handleGetStateAnalysis,
  handleGetWelcomeGuidance,
} from "@/routes/onboarding";
import { handleGetChatHistory } from "@/routes/chat-history";
import {
  handleBulkCompletePlanningTasks,
  handleCreatePlanningTask,
  handleDeletePlanningTask,
  handleGetPlanningTasks,
  handleUpdatePlanningTask,
} from "@/routes/planning-tasks";
import { handleProgressWebSocket } from "@/routes/progress";
import {
  handleDeleteFileForRag,
  handleGetFileChunksForRag,
  handleGetFilesForRag,
  handleProcessFileForRag,
  handleRagSearch,
  handleTriggerIndexing,
  handleCheckFileIndexingStatus,
  handleBulkCheckFileIndexingStatus,
} from "@/routes/rag";
import {
  handleAbortLargeUpload,
  handleCompleteLargeUpload,
  handleDirectUpload,
  handleGetFileStatus,
  handleGetFiles,
  handleGetUploadProgress,
  handleStartLargeUpload,
  handleUpdateFileMetadata,
  handleUploadPart,
  handleUploadStatus,
  handleCleanupStuckFiles,
} from "@/routes/upload";
import type { EnvWithSecrets } from "@/lib/env-utils";
import { AuthService } from "@/services/core/auth-service";
import type { AuthEnv } from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";
import { routeAgentRequest } from "agents";

export interface Env extends AuthEnv, EnvWithSecrets {
  ADMIN_SECRET?: string;
  OPENAI_API_KEY?: string;
  R2: R2Bucket;
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: any;
  CHAT: DurableObjectNamespace;
  UPLOAD_SESSION: DurableObjectNamespace;
  NOTIFICATIONS: DurableObjectNamespace;
  ASSETS: Fetcher;
  FILE_PROCESSING_QUEUE: Queue;
  FILE_PROCESSING_DLQ: Queue;
  GRAPH_REBUILD_QUEUE: Queue;
}

const toApiRoutePath = (path: string) => API_CONFIG.apiRoute(path);

export function registerRoutes(app: Hono<{ Bindings: Env }>) {
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.OPENAI.CHECK_KEY),
    handleCheckOpenAIKey
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.OPENAI.CHECK_USER_KEY),
    handleCheckUserOpenAIKey
  );
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.CHAT.SET_OPENAI_KEY),
    handleSetOpenAIApiKey
  );

  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.AUTH.AUTHENTICATE),
    handleAuthenticate
  );
  app.post(toApiRoutePath(API_CONFIG.ENDPOINTS.AUTH.LOGOUT), handleLogout);
  // Auth OAuth routes at root (not under /api)
  app.get(API_CONFIG.ENDPOINTS.AUTH.GOOGLE, handleGoogleAuth);
  app.get(API_CONFIG.ENDPOINTS.AUTH.GOOGLE_CALLBACK, handleGoogleCallback);
  app.post(
    API_CONFIG.ENDPOINTS.AUTH.GOOGLE_COMPLETE_SIGNUP,
    handleGoogleCompleteSignup
  );
  app.post(API_CONFIG.ENDPOINTS.AUTH.REGISTER, handleRegister);
  app.post(API_CONFIG.ENDPOINTS.AUTH.LOGIN, handleLogin);
  app.get(API_CONFIG.ENDPOINTS.AUTH.VERIFY_EMAIL, handleVerifyEmail);
  app.post(
    API_CONFIG.ENDPOINTS.AUTH.RESEND_VERIFICATION,
    handleResendVerification
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.AUTH.GET_OPENAI_KEY),
    handleGetOpenAIKey
  );
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.AUTH.STORE_OPENAI_KEY),
    handleStoreOpenAIKey
  );
  app.delete(
    toApiRoutePath(API_CONFIG.ENDPOINTS.AUTH.DELETE_OPENAI_KEY),
    handleDeleteOpenAIKey
  );

  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.RAG.SEARCH),
    requireUserJwt,
    handleRagSearch
  );
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.RAG.PROCESS_FILE),
    requireUserJwt,
    handleProcessFileForRag
  );
  // Use wildcard pattern to match file keys with slashes
  app.put(
    toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.UPDATE_METADATA_PATTERN),
    requireUserJwt,
    handleUpdateFileMetadata
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.RAG.FILES),
    requireUserJwt,
    handleGetFilesForRag
  );
  app.delete(
    toApiRoutePath(API_CONFIG.ENDPOINTS.RAG.DELETE_FILE(":fileKey")),
    requireUserJwt,
    handleDeleteFileForRag
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.RAG.FILE_CHUNKS(":fileKey")),
    requireUserJwt,
    handleGetFileChunksForRag
  );
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.RAG.TRIGGER_INDEXING),
    requireUserJwt,
    handleTriggerIndexing
  );
  app.get(toApiRoutePath(API_CONFIG.ENDPOINTS.RAG.STATUS), requireUserJwt);
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.RAG.CHECK_FILE_INDEXING),
    requireUserJwt,
    handleCheckFileIndexingStatus
  );
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.RAG.BULK_CHECK_FILE_INDEXING),
    requireUserJwt,
    handleBulkCheckFileIndexingStatus
  );

  app.route(
    toApiRoutePath(API_CONFIG.ENDPOINTS.FILE_ANALYSIS.BASE),
    fileAnalysisRoutes
  );

  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.LIST),
    requireUserJwt,
    handleGetCampaigns
  );
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.CREATE),
    requireUserJwt,
    handleCreateCampaign
  );
  // Join route: optionalUserJwt allows unauthenticated requests to reach the handler.
  // The handler returns 401 with redirectToLogin when unauthenticated (no redemption).
  // Only authenticated requests can actually join. The app auto-opens sign-in and
  // completes the join after successful auth.
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.JOIN),
    optionalUserJwt,
    handleCampaignJoin
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(":campaignId")),
    requireUserJwt,
    handleGetCampaign
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.CHECKLIST_STATUS(":campaignId")
    ),
    requireUserJwt,
    handleGetChecklistStatus
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_TASKS.BASE(":campaignId")
    ),
    requireUserJwt,
    handleGetPlanningTasks
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_TASKS.BASE(":campaignId")
    ),
    requireUserJwt,
    handleCreatePlanningTask
  );
  app.patch(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_TASKS.DETAILS(
        ":campaignId",
        ":taskId"
      )
    ),
    requireUserJwt,
    handleUpdatePlanningTask
  );
  app.delete(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_TASKS.DETAILS(
        ":campaignId",
        ":taskId"
      )
    ),
    requireUserJwt,
    handleDeletePlanningTask
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_TASKS.COMPLETE_BULK(":campaignId")
    ),
    requireUserJwt,
    handleBulkCompletePlanningTasks
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCES(":campaignId")),
    requireUserJwt,
    handleGetCampaignResources
  );
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE(":campaignId")),
    requireUserJwt,
    handleAddResourceToCampaign
  );
  app.delete(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_DELETE(
        ":campaignId",
        ":resourceId"
      )
    ),
    requireUserJwt,
    handleRemoveResourceFromCampaign
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.RETRY_ENTITY_EXTRACTION(
        ":campaignId",
        ":resourceId"
      )
    ),
    requireUserJwt,
    handleRetryEntityExtraction
  );

  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITY_EXTRACTION_STATUS(
        ":campaignId",
        ":resourceId"
      )
    ),
    requireUserJwt,
    handleGetEntityExtractionStatus
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.CLEANUP_STUCK_ENTITY_EXTRACTION
    ),
    requireUserJwt,
    handleCleanupStuckEntityExtraction
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.PROCESS_ENTITY_EXTRACTION_QUEUE
    ),
    requireUserJwt,
    handleProcessEntityExtractionQueue
  );
  app.delete(
    toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.DELETE(":campaignId")),
    requireUserJwt,
    handleDeleteCampaign
  );
  app.put(
    toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(":campaignId")),
    requireUserJwt,
    handleUpdateCampaign
  );
  app.delete(
    toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.DELETE_ALL),
    requireUserJwt,
    handleDeleteAllCampaigns
  );

  // Share links (owner, editor_gm)
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.SHARE_LINKS(":campaignId")),
    requireUserJwt,
    handleCreateShareLink
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.SHARE_LINKS(":campaignId")),
    requireUserJwt,
    handleListShareLinks
  );
  app.delete(
    toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.SHARE_LINKS_REVOKE_PATTERN),
    requireUserJwt,
    handleRevokeShareLink
  );

  // Resource proposals (editor_player proposes; editor_gm/owner approve)
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSALS(":campaignId")
    ),
    requireUserJwt,
    handleCreateResourceProposal
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSALS(":campaignId")
    ),
    requireUserJwt,
    handleListResourceProposals
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSAL_APPROVE(
        ":campaignId",
        ":id"
      )
    ),
    requireUserJwt,
    handleApproveResourceProposal
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSAL_REJECT(
        ":campaignId",
        ":id"
      )
    ),
    requireUserJwt,
    handleRejectResourceProposal
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSAL_DOWNLOAD(
        ":campaignId",
        ":id"
      )
    ),
    requireUserJwt,
    handleDownloadFileFromProposal
  );

  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.CHANGELOG(":campaignId")
    ),
    requireUserJwt,
    handleCreateWorldStateChangelog
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.CHANGELOG(":campaignId")
    ),
    requireUserJwt,
    handleListWorldStateChangelog
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.OVERLAY(":campaignId")
    ),
    requireUserJwt,
    handleGetWorldStateOverlay
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.HISTORICAL_QUERY(":campaignId")
    ),
    requireUserJwt,
    handleQueryHistoricalState
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.HISTORICAL_OVERLAY(
        ":campaignId"
      )
    ),
    requireUserJwt,
    handleGetHistoricalOverlay
  );

  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.BASE(":campaignId")
    ),
    requireUserJwt,
    handleCreateSessionDigest
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.BASE(":campaignId")
    ),
    requireUserJwt,
    handleGetSessionDigests
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.DETAILS(
        ":campaignId",
        ":digestId"
      )
    ),
    requireUserJwt,
    handleGetSessionDigest
  );
  app.put(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.DETAILS(
        ":campaignId",
        ":digestId"
      )
    ),
    requireUserJwt,
    handleUpdateSessionDigest
  );
  app.delete(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.DETAILS(
        ":campaignId",
        ":digestId"
      )
    ),
    requireUserJwt,
    handleDeleteSessionDigest
  );

  // Session digest review workflow routes
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.SUBMIT(
        ":campaignId",
        ":digestId"
      )
    ),
    requireUserJwt,
    handleSubmitDigestForReview
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.APPROVE(
        ":campaignId",
        ":digestId"
      )
    ),
    requireUserJwt,
    handleApproveDigest
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.REJECT(
        ":campaignId",
        ":digestId"
      )
    ),
    requireUserJwt,
    handleRejectDigest
  );

  // Session digest templates routes
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGEST_TEMPLATES.BASE(
        ":campaignId"
      )
    ),
    requireUserJwt,
    handleCreateSessionDigestTemplate
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGEST_TEMPLATES.BASE(
        ":campaignId"
      )
    ),
    requireUserJwt,
    handleGetSessionDigestTemplates
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGEST_TEMPLATES.DETAILS(
        ":campaignId",
        ":templateId"
      )
    ),
    requireUserJwt,
    handleGetSessionDigestTemplate
  );
  app.put(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGEST_TEMPLATES.DETAILS(
        ":campaignId",
        ":templateId"
      )
    ),
    requireUserJwt,
    handleUpdateSessionDigestTemplate
  );
  app.delete(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGEST_TEMPLATES.DETAILS(
        ":campaignId",
        ":templateId"
      )
    ),
    requireUserJwt,
    handleDeleteSessionDigestTemplate
  );

  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_CONTEXT.SEARCH(":campaignId")
    ),
    requireUserJwt,
    handleSearchPlanningContext
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_CONTEXT.RECENT(":campaignId")
    ),
    requireUserJwt,
    handleGetRecentPlanningContext
  );

  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.CONTEXT_ASSEMBLY(":campaignId")
    ),
    requireUserJwt,
    handleAssembleContext
  );

  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.TRIGGER(":campaignId")
    ),
    requireUserJwt,
    handleTriggerRebuild
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.STATUS(
        ":campaignId",
        ":rebuildId"
      )
    ),
    requireUserJwt,
    handleGetRebuildStatus
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.HISTORY(":campaignId")
    ),
    requireUserJwt,
    handleGetRebuildHistory
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.ACTIVE(":campaignId")
    ),
    requireUserJwt,
    handleGetActiveRebuilds
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.CANCEL(
        ":campaignId",
        ":rebuildId"
      )
    ),
    requireUserJwt,
    handleCancelRebuild
  );

  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.LIST(":campaignId")),
    requireUserJwt,
    handleListEntities
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.DETAILS(
        ":campaignId",
        ":entityId"
      )
    ),
    requireUserJwt,
    handleGetEntity
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.RELATIONSHIPS(
        ":campaignId",
        ":entityId"
      )
    ),
    requireUserJwt,
    handleGetEntityRelationships
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.GRAPH_NEIGHBORS(
        ":campaignId",
        ":entityId"
      )
    ),
    requireUserJwt,
    handleGetEntityNeighbors
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.RELATIONSHIP_TYPES(":campaignId")
    ),
    requireUserJwt,
    handleListRelationshipTypes
  );
  app.patch(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.IMPORTANCE(
        ":campaignId",
        ":entityId"
      )
    ),
    requireUserJwt,
    handleUpdateEntityImportance
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.IMPORTANCE(
        ":campaignId",
        ":entityId"
      )
    ),
    requireUserJwt,
    handleGetEntityImportance
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.IMPORTANCE_TOP(":campaignId")
    ),
    requireUserJwt,
    handleListTopEntitiesByImportance
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.RELATIONSHIPS(
        ":campaignId",
        ":entityId"
      )
    ),
    requireUserJwt,
    handleCreateEntityRelationship
  );
  app.delete(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.RELATIONSHIP_DETAIL(
        ":campaignId",
        ":entityId",
        ":relationshipId"
      )
    ),
    requireUserJwt,
    handleDeleteEntityRelationship
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.EXTRACT(":campaignId")
    ),
    requireUserJwt,
    handleTriggerEntityExtraction
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.DEDUPLICATE(":campaignId")
    ),
    requireUserJwt,
    handleTriggerEntityDeduplication
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.DEDUP_PENDING(":campaignId")
    ),
    requireUserJwt,
    handleListPendingDeduplication
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.DEDUP_RESOLVE(
        ":campaignId",
        ":entryId"
      )
    ),
    requireUserJwt,
    handleResolveDeduplicationEntry
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.TEST_EXTRACT_FROM_R2
    ),
    requireUserJwt,
    handleTestEntityExtractionFromR2
  );

  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.DETECT(":campaignId")
    ),
    requireUserJwt,
    handleDetectCommunities
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.LIST(":campaignId")
    ),
    requireUserJwt,
    handleListCommunities
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.DETAILS(
        ":campaignId",
        ":communityId"
      )
    ),
    requireUserJwt,
    handleGetCommunity
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.BY_LEVEL(
        ":campaignId",
        ":level"
      )
    ),
    requireUserJwt,
    handleGetCommunitiesByLevel
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.CHILDREN(
        ":campaignId",
        ":communityId"
      )
    ),
    requireUserJwt,
    handleGetChildCommunities
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.HIERARCHY(":campaignId")
    ),
    requireUserJwt,
    handleGetCommunityHierarchy
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_VISUALIZATION.BASE(":campaignId")
    ),
    requireUserJwt,
    handleGetGraphVisualization
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_VISUALIZATION.COMMUNITY(
        ":campaignId",
        ":communityId"
      )
    ),
    requireUserJwt,
    handleGetCommunityEntityGraph
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_VISUALIZATION.SEARCH_ENTITY(
        ":campaignId"
      )
    ),
    requireUserJwt,
    handleSearchEntityInGraph
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.SUMMARY(
        ":campaignId",
        ":communityId"
      )
    ),
    requireUserJwt,
    handleGetCommunitySummary
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.SUMMARIES(":campaignId")
    ),
    requireUserJwt,
    handleListCommunitySummaries
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.GENERATE_SUMMARY(
        ":campaignId",
        ":communityId"
      )
    ),
    requireUserJwt,
    handleGenerateCommunitySummary
  );

  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.APPROVE(":campaignId")
    ),
    requireUserJwt,
    handleApproveShards
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.REJECT(":campaignId")
    ),
    requireUserJwt,
    handleRejectShards
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.STAGED_SHARDS(
        ":campaignId"
      )
    ),
    requireUserJwt,
    handleGetStagedShards
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.APPROVE_SHARDS(
        ":campaignId"
      )
    ),
    requireUserJwt,
    handleApproveShards
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.REJECT_SHARDS(
        ":campaignId"
      )
    ),
    requireUserJwt,
    handleRejectShards
  );
  app.put(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.UPDATE_SHARD(
        ":campaignId",
        ":shardId"
      )
    ),
    requireUserJwt,
    handleUpdateShard
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.GENERATE_FIELD(
        ":campaignId",
        ":shardId"
      )
    ),
    requireUserJwt,
    handleGenerateShardField
  );

  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.PROGRESS.WEBSOCKET),
    handleProgressWebSocket
  );

  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.ASSESSMENT.USER_STATE),
    requireUserJwt,
    handleGetUserState
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.ASSESSMENT.CAMPAIGN_READINESS(":campaignId")
    ),
    requireUserJwt,
    handleGetAssessmentRecommendations
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.ASSESSMENT.USER_ACTIVITY),
    requireUserJwt,
    handleGetUserActivity
  );
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.ASSESSMENT.MODULE_INTEGRATION),
    requireUserJwt,
    handleModuleIntegration
  );

  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.ONBOARDING.WELCOME_GUIDANCE),
    requireUserJwt,
    handleGetWelcomeGuidance
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.ONBOARDING.NEXT_ACTIONS),
    requireUserJwt,
    handleGetNextActions
  );
  app.get(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.ONBOARDING.CAMPAIGN_GUIDANCE(":campaignId")
    ),
    requireUserJwt,
    handleGetStateAnalysis
  );

  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.EXTERNAL_RESOURCES.RECOMMENDATIONS),
    requireUserJwt,
    handleGetExternalResourceRecommendations
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.EXTERNAL_RESOURCES.INSPIRATION_SOURCES),
    requireUserJwt,
    handleGetExternalResourceSearch
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.EXTERNAL_RESOURCES.GM_RESOURCES),
    requireUserJwt,
    handleGetGmResources
  );

  // Telemetry endpoints
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.TELEMETRY.RATINGS),
    requireUserJwt,
    handleRecordSatisfactionRating
  );
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.TELEMETRY.CONTEXT_ACCURACY),
    requireUserJwt,
    handleRecordContextAccuracy
  );

  // Admin telemetry endpoints
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.ADMIN.TELEMETRY.METRICS),
    requireUserJwt,
    handleGetMetrics
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.ADMIN.TELEMETRY.DASHBOARD),
    requireUserJwt,
    handleGetDashboard
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.ADMIN.TELEMETRY.ALERTS),
    requireUserJwt,
    handleGetAlerts
  );

  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.FILES),
    requireUserJwt,
    handleGetFiles
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.SEARCH),
    requireUserJwt,
    handleSearchFiles
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.STORAGE_USAGE),
    requireUserJwt,
    handleGetStorageUsage
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.FILE_DETAILS(":fileId")),
    requireUserJwt,
    handleGetFileDetails
  );
  app.put(
    toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.FILE_UPDATE(":fileId")),
    requireUserJwt,
    handleUpdateFile
  );
  app.delete(
    toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.FILE_DELETE(":fileId")),
    requireUserJwt,
    handleDeleteFile
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.FILE_DOWNLOAD(":fileId")),
    requireUserJwt,
    handleGetFileDownload
  );
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.FILE_REGENERATE(":fileId")),
    requireUserJwt,
    handleRegenerateFileMetadata
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.STATUS),
    requireUserJwt,
    handleGetFileStatus
  );

  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.NOTIFICATIONS.MINT_STREAM),
    handleMintStreamToken
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.NOTIFICATIONS.STREAM),
    handleNotificationStream
  );
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.NOTIFICATIONS.PUBLISH),
    handleNotificationPublish
  );

  app.put(
    toApiRoutePath(API_CONFIG.ENDPOINTS.UPLOAD.DIRECT(":tenant", ":filename")),
    requireUserJwt,
    handleDirectUpload
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.UPLOAD.STATUS(":tenant", ":filename")),
    requireUserJwt,
    handleUploadStatus
  );
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.UPLOAD.START_LARGE),
    requireUserJwt,
    handleStartLargeUpload
  );
  app.post(
    toApiRoutePath(
      API_CONFIG.ENDPOINTS.UPLOAD.UPLOAD_PART(":sessionId", ":partNumber")
    ),
    requireUserJwt,
    handleUploadPart
  );
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.UPLOAD.COMPLETE_LARGE(":sessionId")),
    requireUserJwt,
    handleCompleteLargeUpload
  );
  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.UPLOAD.PROGRESS(":sessionId")),
    requireUserJwt,
    handleGetUploadProgress
  );
  app.delete(
    toApiRoutePath(API_CONFIG.ENDPOINTS.UPLOAD.ABORT_LARGE(":sessionId")),
    requireUserJwt,
    handleAbortLargeUpload
  );
  app.post(
    toApiRoutePath(API_CONFIG.ENDPOINTS.UPLOAD.CLEANUP_STUCK),
    requireUserJwt,
    handleCleanupStuckFiles
  );

  const serveIndexHtml = async (c: Context<{ Bindings: Env }>) => {
    try {
      // Pass request through to ASSETS; with not_found_handling: single-page-application,
      // paths like /join that don't match a file will serve index.html
      const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
      if (assetResponse.status === 200) {
        return assetResponse;
      }
    } catch (_error) {
      console.log("Index.html not found in assets");
    }
    return new Response("Index.html not found", { status: 404 });
  };

  app.get("/", serveIndexHtml);
  app.get("/join", serveIndexHtml);

  app.get("/assets/*", async (c) => {
    try {
      const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
      if (assetResponse.status === 200) {
        return assetResponse;
      }
    } catch (_error) {
      console.log("Asset not found:", c.req.path);
    }
    return new Response("Asset not found", { status: 404 });
  });

  app.get("/favicon.ico", async (c) => {
    try {
      const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
      if (assetResponse.status === 200) {
        return assetResponse;
      }
    } catch (_error) {
      console.log("Favicon not found");
    }
    return new Response("Favicon not found", { status: 404 });
  });

  const handleAgentsRoute = async (c: Context<{ Bindings: Env }>) => {
    const authHeader = c.req.header("Authorization");
    const authPayload = await AuthService.extractAuthFromHeader(
      authHeader,
      c.env
    );

    const modifiedRequest = AuthService.createRequestWithAuthContext(
      c.req.raw,
      authPayload
    );

    return (
      (await routeAgentRequest(modifiedRequest, c.env as any, {
        cors: true,
        prefix: "api/agents",
      })) || new Response("Agent route not found", { status: 404 })
    );
  };

  app.get(
    toApiRoutePath(API_CONFIG.ENDPOINTS.CHAT.HISTORY(":sessionId")),
    requireUserJwt,
    handleGetChatHistory
  );

  app.get(toApiRoutePath("/agents/*"), handleAgentsRoute);
  app.post(toApiRoutePath("/agents/*"), handleAgentsRoute);
  app.options(toApiRoutePath("/agents/*"), handleAgentsRoute);

  app.get("*", async (_c) => {
    return new Response("Route not found", { status: 404 });
  });
}
