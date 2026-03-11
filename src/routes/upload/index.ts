import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import {
	handleAbortLargeUpload,
	handleCleanupStuckFiles,
	handleCompleteLargeUpload,
	handleDirectUpload,
	handleGetUploadProgress,
	handleStartLargeUpload,
	handleUploadPart,
	handleUploadStatus,
} from "@/routes/upload";
import { API_CONFIG } from "@/shared-config";

export function registerUploadRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
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
}
