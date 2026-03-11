import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
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
import {
	routeBulkCheckFileIndexingStatus,
	routeCheckFileIndexingStatus,
	routeDeleteFileForRag,
	routeGetFileChunksForRag,
	routeGetFilesForRag,
	routeProcessFileForRag,
	routeRagSearch,
	routeTriggerIndexing,
} from "@/routes/rag/routes";
import { handleUpdateFileMetadata } from "@/routes/upload";
import { API_CONFIG } from "@/shared-config";

export function registerRagRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(routeRagSearch, handleRagSearch as unknown as Handler);
	app.openapi(
		routeProcessFileForRag,
		handleProcessFileForRag as unknown as Handler
	);
	// UPDATE_METADATA uses :fileKey{.+} pattern - keep as regular route
	app.put(
		toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.UPDATE_METADATA_PATTERN),
		requireUserJwt,
		handleUpdateFileMetadata
	);
	app.openapi(routeGetFilesForRag, handleGetFilesForRag as unknown as Handler);
	app.openapi(
		routeDeleteFileForRag,
		handleDeleteFileForRag as unknown as Handler
	);
	app.openapi(
		routeGetFileChunksForRag,
		handleGetFileChunksForRag as unknown as Handler
	);
	app.openapi(
		routeTriggerIndexing,
		handleTriggerIndexing as unknown as Handler
	);
	// RAG STATUS - original had no handler; return minimal placeholder
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.RAG.STATUS),
		requireUserJwt,
		(c) => c.json({ status: "ok", message: "RAG status endpoint" }, 200)
	);
	app.openapi(
		routeCheckFileIndexingStatus,
		handleCheckFileIndexingStatus as unknown as Handler
	);
	app.openapi(
		routeBulkCheckFileIndexingStatus,
		handleBulkCheckFileIndexingStatus as unknown as Handler
	);
}
