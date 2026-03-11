import { createRoute, z } from "@hono/zod-openapi";
import { requireUserJwt } from "@/routes/auth";
import {
	ErrorResponseContent,
	SessionIdParam,
	SessionIdPartParams,
	TenantFilenameParams,
} from "@/routes/schemas/upload";
import { API_CONFIG } from "@/shared-config";
import { toApiRoutePath } from "../env";

const E401 = {
	401: { content: ErrorResponseContent, description: "Unauthorized" },
} as const;
const E500 = {
	500: { content: ErrorResponseContent, description: "Internal server error" },
} as const;
const jsonDesc = (d: string) => ({
	content: { "application/json": { schema: z.any() } } as const,
	description: d,
});

export const routeDirectUpload = createRoute({
	method: "put",
	path: toApiRoutePath("/upload/direct/{tenant}/{filename}"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: TenantFilenameParams },
	responses: {
		200: jsonDesc("Upload complete"),
		401: E401[401],
		500: E500[500],
	},
});

export const routeUploadStatus = createRoute({
	method: "get",
	path: toApiRoutePath("/upload/status/{tenant}/{filename}"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: TenantFilenameParams },
	responses: { 200: jsonDesc("Upload status"), 401: E401[401], 500: E500[500] },
});

export const routeStartLargeUpload = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.UPLOAD.START_LARGE),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { body: { content: { "application/json": { schema: z.any() } } } },
	responses: {
		200: jsonDesc("Upload session"),
		401: E401[401],
		500: E500[500],
	},
});

export const routeUploadPart = createRoute({
	method: "post",
	path: toApiRoutePath("/upload/part/{sessionId}/{partNumber}"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: SessionIdPartParams },
	responses: { 200: jsonDesc("Part uploaded"), 401: E401[401], 500: E500[500] },
});

export const routeCompleteLargeUpload = createRoute({
	method: "post",
	path: toApiRoutePath("/upload/complete-large/{sessionId}"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: SessionIdParam },
	responses: {
		200: jsonDesc("Upload complete"),
		401: E401[401],
		500: E500[500],
	},
});

export const routeGetUploadProgress = createRoute({
	method: "get",
	path: toApiRoutePath("/upload/progress/{sessionId}"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: SessionIdParam },
	responses: {
		200: jsonDesc("Upload progress"),
		401: E401[401],
		500: E500[500],
	},
});

export const routeAbortLargeUpload = createRoute({
	method: "delete",
	path: toApiRoutePath("/upload/abort-large/{sessionId}"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: SessionIdParam },
	responses: {
		200: jsonDesc("Upload aborted"),
		401: E401[401],
		500: E500[500],
	},
});

export const routeCleanupStuckFiles = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.UPLOAD.CLEANUP_STUCK),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: {
		200: jsonDesc("Cleanup complete"),
		401: E401[401],
		500: E500[500],
	},
});
