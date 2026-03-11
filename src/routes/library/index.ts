import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";
import {
	handleDeleteFile,
	handleGetFileDetails,
	handleGetFileDownload,
	handleGetLlmUsage,
	handleGetStorageUsage,
	handleRegenerateFileMetadata,
	handleSearchFiles,
	handleUpdateFile,
} from "@/routes/library";
import {
	routeDeleteFile,
	routeGetFileDetails,
	routeGetFileDownload,
	routeGetFileStatus,
	routeGetFiles,
	routeGetLlmUsage,
	routeGetStorageUsage,
	routeRegenerateFileMetadata,
	routeSearchFiles,
	routeUpdateFile,
} from "@/routes/library/routes";
import { handleGetFileStatus, handleGetFiles } from "@/routes/upload";

export function registerLibraryRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(routeGetFiles, handleGetFiles as unknown as Handler);
	app.openapi(routeSearchFiles, handleSearchFiles as unknown as Handler);
	app.openapi(
		routeGetStorageUsage,
		handleGetStorageUsage as unknown as Handler
	);
	app.openapi(routeGetLlmUsage, handleGetLlmUsage as unknown as Handler);
	app.openapi(routeGetFileDetails, handleGetFileDetails as unknown as Handler);
	app.openapi(routeUpdateFile, handleUpdateFile as unknown as Handler);
	app.openapi(routeDeleteFile, handleDeleteFile as unknown as Handler);
	app.openapi(
		routeGetFileDownload,
		handleGetFileDownload as unknown as Handler
	);
	app.openapi(
		routeRegenerateFileMetadata,
		handleRegenerateFileMetadata as unknown as Handler
	);
	app.openapi(routeGetFileStatus, handleGetFileStatus as unknown as Handler);
}
