import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
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
import { handleGetFileStatus, handleGetFiles } from "@/routes/upload";
import { API_CONFIG } from "@/shared-config";

export function registerLibraryRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
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
		toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.LLM_USAGE),
		requireUserJwt,
		handleGetLlmUsage
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
}
