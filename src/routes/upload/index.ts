import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";
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
import {
	routeAbortLargeUpload,
	routeCleanupStuckFiles,
	routeCompleteLargeUpload,
	routeDirectUpload,
	routeGetUploadProgress,
	routeStartLargeUpload,
	routeUploadPart,
	routeUploadStatus,
} from "@/routes/upload/routes";

export function registerUploadRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(routeDirectUpload, handleDirectUpload as unknown as Handler);
	app.openapi(routeUploadStatus, handleUploadStatus as unknown as Handler);
	app.openapi(
		routeStartLargeUpload,
		handleStartLargeUpload as unknown as Handler
	);
	app.openapi(routeUploadPart, handleUploadPart as unknown as Handler);
	app.openapi(
		routeCompleteLargeUpload,
		handleCompleteLargeUpload as unknown as Handler
	);
	app.openapi(
		routeGetUploadProgress,
		handleGetUploadProgress as unknown as Handler
	);
	app.openapi(
		routeAbortLargeUpload,
		handleAbortLargeUpload as unknown as Handler
	);
	app.openapi(
		routeCleanupStuckFiles,
		handleCleanupStuckFiles as unknown as Handler
	);
}
