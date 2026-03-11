import { createRoute, z } from "@hono/zod-openapi";
import { requireUserJwt } from "@/routes/auth";
import {
	ErrorResponseContent,
	FileIdParamSchema,
} from "@/routes/schemas/library";
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

export const routeGetFiles = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.FILES),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("File list"), ...E401, ...E500 },
});

export const routeSearchFiles = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.SEARCH),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("Search results"), ...E401, ...E500 },
});

export const routeGetStorageUsage = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.STORAGE_USAGE),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("Storage usage"), ...E401, ...E500 },
});

export const routeGetLlmUsage = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.LLM_USAGE),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("LLM usage"), ...E401, ...E500 },
});

export const routeGetFileDetails = createRoute({
	method: "get",
	path: toApiRoutePath("/library/files/{fileId}"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: FileIdParamSchema },
	responses: {
		200: jsonDesc("File details"),
		401: E401[401],
		404: { content: ErrorResponseContent, description: "Not found" },
		500: E500[500],
	},
});

export const routeUpdateFile = createRoute({
	method: "put",
	path: toApiRoutePath("/library/files/{fileId}"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: FileIdParamSchema,
		body: { content: { "application/json": { schema: z.any() } } },
	},
	responses: {
		200: jsonDesc("File updated"),
		401: E401[401],
		404: { content: ErrorResponseContent, description: "Not found" },
		500: E500[500],
	},
});

export const routeDeleteFile = createRoute({
	method: "delete",
	path: toApiRoutePath("/library/files/{fileId}"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: FileIdParamSchema },
	responses: {
		200: jsonDesc("File deleted"),
		401: E401[401],
		404: { content: ErrorResponseContent, description: "Not found" },
		500: E500[500],
	},
});

export const routeGetFileDownload = createRoute({
	method: "get",
	path: toApiRoutePath("/library/files/{fileId}/download"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: FileIdParamSchema },
	responses: {
		200: { description: "File stream" },
		401: E401[401],
		404: { content: ErrorResponseContent, description: "Not found" },
		500: E500[500],
	},
});

export const routeRegenerateFileMetadata = createRoute({
	method: "post",
	path: toApiRoutePath("/library/files/{fileId}/regenerate"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: FileIdParamSchema },
	responses: {
		200: jsonDesc("Regeneration started"),
		401: E401[401],
		404: { content: ErrorResponseContent, description: "Not found" },
		500: E500[500],
	},
});

export const routeGetFileStatus = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.LIBRARY.STATUS),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("File status"), ...E401, ...E500 },
});
