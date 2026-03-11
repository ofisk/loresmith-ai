import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import {
	handleBulkCheckFileIndexingStatus,
	handleCheckFileIndexingStatus,
	handleDeleteFileForRag,
	handleGetFileChunksForRag,
	handleGetFilesForRag,
	handleProcessFileForRag,
	handleRagSearch,
	handleTriggerIndexing,
} from "@/routes/rag";
import { handleUpdateFileMetadata } from "@/routes/upload";
import { API_CONFIG } from "@/shared-config";

export function registerRagRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
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
}
