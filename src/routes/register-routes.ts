import type { Hono } from "hono";
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
  handleLogout,
  handleSetOpenAIApiKey,
  handleStoreOpenAIKey,
  requireUserJwt,
} from "@/routes/auth";
import {
  handleApproveShards,
  handleGetStagedShards,
  handleRejectShards,
  handleUpdateShard,
} from "@/routes/campaign-graphrag";
import {
  handleAddResourceToCampaign,
  handleCreateCampaign,
  handleDeleteAllCampaigns,
  handleDeleteCampaign,
  handleGetCampaign,
  handleGetCampaignResources,
  handleGetCampaigns,
  handleRemoveResourceFromCampaign,
  handleUpdateCampaign,
} from "@/routes/campaigns";
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
  handleCreateWorldStateChangelog,
  handleGetWorldStateOverlay,
  handleListWorldStateChangelog,
} from "@/routes/world-state";
import {
  handleCreateSessionDigest,
  handleGetSessionDigest,
  handleGetSessionDigests,
  handleUpdateSessionDigest,
  handleDeleteSessionDigest,
} from "@/routes/session-digests";
import {
  handleSearchPlanningContext,
  handleGetRecentPlanningContext,
} from "@/routes/planning-context";
import {
  handleGetExternalResourceRecommendations,
  handleGetExternalResourceSearch,
  handleGetGmResources,
} from "@/routes/external-resources";
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
import { handleProgressWebSocket } from "@/routes/progress";
import {
  handleDeleteFileForRag,
  handleGetFileChunksForRag,
  handleGetFilesForRag,
  handleProcessFileForRag,
  handleProcessFileFromR2ForRag,
  handleRagSearch,
  handleTriggerAutoRAGIndexing,
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
} from "@/routes/upload";
import { AuthService } from "@/services/core/auth-service";
import type { AuthEnv } from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";
import { routeAgentRequest } from "agents";

export interface Env extends AuthEnv {
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
}

export function registerRoutes(app: Hono<{ Bindings: Env }>) {
  app.get(API_CONFIG.ENDPOINTS.OPENAI.CHECK_KEY, handleCheckOpenAIKey);
  app.get(API_CONFIG.ENDPOINTS.OPENAI.CHECK_USER_KEY, handleCheckUserOpenAIKey);
  app.post(API_CONFIG.ENDPOINTS.CHAT.SET_OPENAI_KEY, handleSetOpenAIApiKey);

  app.post(API_CONFIG.ENDPOINTS.AUTH.AUTHENTICATE, handleAuthenticate);
  app.post(API_CONFIG.ENDPOINTS.AUTH.LOGOUT, handleLogout);
  app.get(API_CONFIG.ENDPOINTS.AUTH.GET_OPENAI_KEY, handleGetOpenAIKey);
  app.post(API_CONFIG.ENDPOINTS.AUTH.STORE_OPENAI_KEY, handleStoreOpenAIKey);
  app.delete(
    API_CONFIG.ENDPOINTS.AUTH.DELETE_OPENAI_KEY,
    handleDeleteOpenAIKey
  );

  app.post(API_CONFIG.ENDPOINTS.RAG.SEARCH, requireUserJwt, handleRagSearch);
  app.post(
    API_CONFIG.ENDPOINTS.RAG.PROCESS_FILE,
    requireUserJwt,
    handleProcessFileForRag
  );
  app.post(
    API_CONFIG.ENDPOINTS.RAG.PROCESS_FILE_FROM_R2,
    requireUserJwt,
    handleProcessFileFromR2ForRag
  );
  app.put(
    API_CONFIG.ENDPOINTS.LIBRARY.UPDATE_METADATA(":fileKey"),
    requireUserJwt,
    handleUpdateFileMetadata
  );
  app.get(API_CONFIG.ENDPOINTS.RAG.FILES, requireUserJwt, handleGetFilesForRag);
  app.delete(
    API_CONFIG.ENDPOINTS.RAG.DELETE_FILE(":fileKey"),
    requireUserJwt,
    handleDeleteFileForRag
  );
  app.get(
    API_CONFIG.ENDPOINTS.RAG.FILE_CHUNKS(":fileKey"),
    requireUserJwt,
    handleGetFileChunksForRag
  );
  app.post(
    API_CONFIG.ENDPOINTS.RAG.TRIGGER_INDEXING,
    requireUserJwt,
    handleTriggerAutoRAGIndexing
  );
  app.get(API_CONFIG.ENDPOINTS.RAG.STATUS, requireUserJwt);
  app.post(
    API_CONFIG.ENDPOINTS.RAG.CHECK_FILE_INDEXING,
    requireUserJwt,
    handleCheckFileIndexingStatus
  );
  app.post(
    API_CONFIG.ENDPOINTS.RAG.BULK_CHECK_FILE_INDEXING,
    requireUserJwt,
    handleBulkCheckFileIndexingStatus
  );

  app.route(API_CONFIG.ENDPOINTS.FILE_ANALYSIS.BASE, fileAnalysisRoutes);

  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.LIST,
    requireUserJwt,
    handleGetCampaigns
  );
  app.post(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.CREATE,
    requireUserJwt,
    handleCreateCampaign
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(":campaignId"),
    requireUserJwt,
    handleGetCampaign
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCES(":campaignId"),
    requireUserJwt,
    handleGetCampaignResources
  );
  app.post(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE(":campaignId"),
    requireUserJwt,
    handleAddResourceToCampaign
  );
  app.delete(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_DELETE(
      ":campaignId",
      ":resourceId"
    ),
    requireUserJwt,
    handleRemoveResourceFromCampaign
  );
  app.delete(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.DELETE(":campaignId"),
    requireUserJwt,
    handleDeleteCampaign
  );
  app.put(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(":campaignId"),
    requireUserJwt,
    handleUpdateCampaign
  );
  app.delete(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.DELETE_ALL,
    requireUserJwt,
    handleDeleteAllCampaigns
  );

  app.post(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.CHANGELOG(":campaignId"),
    requireUserJwt,
    handleCreateWorldStateChangelog
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.CHANGELOG(":campaignId"),
    requireUserJwt,
    handleListWorldStateChangelog
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.OVERLAY(":campaignId"),
    requireUserJwt,
    handleGetWorldStateOverlay
  );

  app.post(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.BASE(":campaignId"),
    requireUserJwt,
    handleCreateSessionDigest
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.BASE(":campaignId"),
    requireUserJwt,
    handleGetSessionDigests
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.DETAILS(
      ":campaignId",
      ":digestId"
    ),
    requireUserJwt,
    handleGetSessionDigest
  );
  app.put(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.DETAILS(
      ":campaignId",
      ":digestId"
    ),
    requireUserJwt,
    handleUpdateSessionDigest
  );
  app.delete(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.DETAILS(
      ":campaignId",
      ":digestId"
    ),
    requireUserJwt,
    handleDeleteSessionDigest
  );

  app.post(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_CONTEXT.SEARCH(":campaignId"),
    requireUserJwt,
    handleSearchPlanningContext
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_CONTEXT.RECENT(":campaignId"),
    requireUserJwt,
    handleGetRecentPlanningContext
  );

  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.LIST(":campaignId"),
    requireUserJwt,
    handleListEntities
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.DETAILS(":campaignId", ":entityId"),
    requireUserJwt,
    handleGetEntity
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.RELATIONSHIPS(
      ":campaignId",
      ":entityId"
    ),
    requireUserJwt,
    handleGetEntityRelationships
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.GRAPH_NEIGHBORS(
      ":campaignId",
      ":entityId"
    ),
    requireUserJwt,
    handleGetEntityNeighbors
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.RELATIONSHIP_TYPES(":campaignId"),
    requireUserJwt,
    handleListRelationshipTypes
  );
  app.patch(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.IMPORTANCE(
      ":campaignId",
      ":entityId"
    ),
    requireUserJwt,
    handleUpdateEntityImportance
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.IMPORTANCE(
      ":campaignId",
      ":entityId"
    ),
    requireUserJwt,
    handleGetEntityImportance
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.IMPORTANCE_TOP(":campaignId"),
    requireUserJwt,
    handleListTopEntitiesByImportance
  );
  app.post(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.RELATIONSHIPS(
      ":campaignId",
      ":entityId"
    ),
    requireUserJwt,
    handleCreateEntityRelationship
  );
  app.delete(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.RELATIONSHIP_DETAIL(
      ":campaignId",
      ":entityId",
      ":relationshipId"
    ),
    requireUserJwt,
    handleDeleteEntityRelationship
  );
  app.post(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.EXTRACT(":campaignId"),
    requireUserJwt,
    handleTriggerEntityExtraction
  );
  app.post(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.DEDUPLICATE(":campaignId"),
    requireUserJwt,
    handleTriggerEntityDeduplication
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.DEDUP_PENDING(":campaignId"),
    requireUserJwt,
    handleListPendingDeduplication
  );
  app.post(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.DEDUP_RESOLVE(
      ":campaignId",
      ":entryId"
    ),
    requireUserJwt,
    handleResolveDeduplicationEntry
  );

  app.post(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.DETECT(":campaignId"),
    requireUserJwt,
    handleDetectCommunities
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.LIST(":campaignId"),
    requireUserJwt,
    handleListCommunities
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.DETAILS(
      ":campaignId",
      ":communityId"
    ),
    requireUserJwt,
    handleGetCommunity
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.BY_LEVEL(
      ":campaignId",
      ":level"
    ),
    requireUserJwt,
    handleGetCommunitiesByLevel
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.CHILDREN(
      ":campaignId",
      ":communityId"
    ),
    requireUserJwt,
    handleGetChildCommunities
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.HIERARCHY(":campaignId"),
    requireUserJwt,
    handleGetCommunityHierarchy
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.SUMMARY(
      ":campaignId",
      ":communityId"
    ),
    requireUserJwt,
    handleGetCommunitySummary
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.SUMMARIES(":campaignId"),
    requireUserJwt,
    handleListCommunitySummaries
  );
  app.post(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.GENERATE_SUMMARY(
      ":campaignId",
      ":communityId"
    ),
    requireUserJwt,
    handleGenerateCommunitySummary
  );

  app.post(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.APPROVE(":campaignId"),
    requireUserJwt,
    handleApproveShards
  );
  app.post(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.REJECT(":campaignId"),
    requireUserJwt,
    handleRejectShards
  );
  app.get(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.STAGED_SHARDS(
      ":campaignId"
    ),
    requireUserJwt,
    handleGetStagedShards
  );
  app.post(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.APPROVE_SHARDS(
      ":campaignId"
    ),
    requireUserJwt,
    handleApproveShards
  );
  app.post(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.REJECT_SHARDS(
      ":campaignId"
    ),
    requireUserJwt,
    handleRejectShards
  );
  app.put(
    API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.UPDATE_SHARD(
      ":campaignId",
      ":shardId"
    ),
    requireUserJwt,
    handleUpdateShard
  );

  app.get(API_CONFIG.ENDPOINTS.PROGRESS.WEBSOCKET, handleProgressWebSocket);

  app.get(
    API_CONFIG.ENDPOINTS.ASSESSMENT.USER_STATE,
    requireUserJwt,
    handleGetUserState
  );
  app.get(
    API_CONFIG.ENDPOINTS.ASSESSMENT.CAMPAIGN_READINESS(":campaignId"),
    requireUserJwt,
    handleGetAssessmentRecommendations
  );
  app.get(
    API_CONFIG.ENDPOINTS.ASSESSMENT.USER_ACTIVITY,
    requireUserJwt,
    handleGetUserActivity
  );
  app.post(
    API_CONFIG.ENDPOINTS.ASSESSMENT.MODULE_INTEGRATION,
    requireUserJwt,
    handleModuleIntegration
  );

  app.get(
    API_CONFIG.ENDPOINTS.ONBOARDING.WELCOME_GUIDANCE,
    requireUserJwt,
    handleGetWelcomeGuidance
  );
  app.get(
    API_CONFIG.ENDPOINTS.ONBOARDING.NEXT_ACTIONS,
    requireUserJwt,
    handleGetNextActions
  );
  app.get(
    API_CONFIG.ENDPOINTS.ONBOARDING.CAMPAIGN_GUIDANCE(":campaignId"),
    requireUserJwt,
    handleGetStateAnalysis
  );

  app.get(
    API_CONFIG.ENDPOINTS.EXTERNAL_RESOURCES.RECOMMENDATIONS,
    requireUserJwt,
    handleGetExternalResourceRecommendations
  );
  app.get(
    API_CONFIG.ENDPOINTS.EXTERNAL_RESOURCES.INSPIRATION_SOURCES,
    requireUserJwt,
    handleGetExternalResourceSearch
  );
  app.get(
    API_CONFIG.ENDPOINTS.EXTERNAL_RESOURCES.GM_RESOURCES,
    requireUserJwt,
    handleGetGmResources
  );

  app.get(API_CONFIG.ENDPOINTS.LIBRARY.FILES, requireUserJwt, handleGetFiles);
  app.get(
    API_CONFIG.ENDPOINTS.LIBRARY.SEARCH,
    requireUserJwt,
    handleSearchFiles
  );
  app.get(
    API_CONFIG.ENDPOINTS.LIBRARY.STORAGE_USAGE,
    requireUserJwt,
    handleGetStorageUsage
  );
  app.get(
    API_CONFIG.ENDPOINTS.LIBRARY.FILE_DETAILS(":fileId"),
    requireUserJwt,
    handleGetFileDetails
  );
  app.put(
    API_CONFIG.ENDPOINTS.LIBRARY.FILE_UPDATE(":fileId"),
    requireUserJwt,
    handleUpdateFile
  );
  app.delete(
    API_CONFIG.ENDPOINTS.LIBRARY.FILE_DELETE(":fileId"),
    requireUserJwt,
    handleDeleteFile
  );
  app.get(
    API_CONFIG.ENDPOINTS.LIBRARY.FILE_DOWNLOAD(":fileId"),
    requireUserJwt,
    handleGetFileDownload
  );
  app.post(
    API_CONFIG.ENDPOINTS.LIBRARY.FILE_REGENERATE(":fileId"),
    requireUserJwt,
    handleRegenerateFileMetadata
  );
  app.get(
    API_CONFIG.ENDPOINTS.LIBRARY.STATUS,
    requireUserJwt,
    handleGetFileStatus
  );

  app.post(
    API_CONFIG.ENDPOINTS.NOTIFICATIONS.MINT_STREAM,
    handleMintStreamToken
  );
  app.get(API_CONFIG.ENDPOINTS.NOTIFICATIONS.STREAM, handleNotificationStream);
  app.post(
    API_CONFIG.ENDPOINTS.NOTIFICATIONS.PUBLISH,
    handleNotificationPublish
  );

  app.put(
    API_CONFIG.ENDPOINTS.UPLOAD.DIRECT(":tenant", ":filename"),
    requireUserJwt,
    handleDirectUpload
  );
  app.get(
    API_CONFIG.ENDPOINTS.UPLOAD.STATUS(":tenant", ":filename"),
    requireUserJwt,
    handleUploadStatus
  );
  app.post(
    API_CONFIG.ENDPOINTS.UPLOAD.START_LARGE,
    requireUserJwt,
    handleStartLargeUpload
  );
  app.post(
    API_CONFIG.ENDPOINTS.UPLOAD.UPLOAD_PART(":sessionId", ":partNumber"),
    requireUserJwt,
    handleUploadPart
  );
  app.post(
    API_CONFIG.ENDPOINTS.UPLOAD.COMPLETE_LARGE(":sessionId"),
    requireUserJwt,
    handleCompleteLargeUpload
  );
  app.get(
    API_CONFIG.ENDPOINTS.UPLOAD.PROGRESS(":sessionId"),
    requireUserJwt,
    handleGetUploadProgress
  );
  app.delete(
    API_CONFIG.ENDPOINTS.UPLOAD.ABORT_LARGE(":sessionId"),
    requireUserJwt,
    handleAbortLargeUpload
  );

  app.get("/", async (c) => {
    try {
      // Serve index.html from assets
      const indexUrl = new URL(c.req.url);
      indexUrl.pathname = "/index.html";
      const assetResponse = await c.env.ASSETS.fetch(new Request(indexUrl));
      if (assetResponse.status === 200) {
        return assetResponse;
      }
    } catch (_error) {
      console.log("Index.html not found in assets");
    }
    return new Response("Index.html not found", { status: 404 });
  });

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

  app.get("/agents/*", async (c) => {
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
      })) || new Response("Agent route not found", { status: 404 })
    );
  });

  app.get("*", async (_c) => {
    return new Response("Route not found", { status: 404 });
  });
}
