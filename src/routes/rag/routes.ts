import { createRoute, z } from "@hono/zod-openapi";
import { requireUserJwt } from "@/routes/auth";
import { toApiRoutePath } from "@/routes/env";
import { ErrorResponseContent, FileKeyParamSchema } from "@/routes/schemas/rag";
import { API_CONFIG } from "@/shared-config";

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

export const routeRagSearch = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.RAG.SEARCH),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { body: { content: { "application/json": { schema: z.any() } } } },
	responses: {
		200: jsonDesc("Search results"),
		401: E401[401],
		500: E500[500],
	},
});

export const routeProcessFileForRag = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.RAG.PROCESS_FILE),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { body: { content: { "application/json": { schema: z.any() } } } },
	responses: {
		200: jsonDesc("Processing started"),
		401: E401[401],
		500: E500[500],
	},
});

export const routeGetFilesForRag = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.RAG.FILES),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("File list"), 401: E401[401], 500: E500[500] },
});

export const routeDeleteFileForRag = createRoute({
	method: "delete",
	path: toApiRoutePath("/rag/files/{fileKey}"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: FileKeyParamSchema },
	responses: { 200: jsonDesc("File deleted"), 401: E401[401], 500: E500[500] },
});

export const routeGetFileChunksForRag = createRoute({
	method: "get",
	path: toApiRoutePath("/rag/files/{fileKey}/chunks"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: FileKeyParamSchema },
	responses: { 200: jsonDesc("File chunks"), 401: E401[401], 500: E500[500] },
});

export const routeTriggerIndexing = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.RAG.TRIGGER_INDEXING),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: {
		200: jsonDesc("Indexing triggered"),
		401: E401[401],
		500: E500[500],
	},
});

export const routeCheckFileIndexingStatus = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.RAG.CHECK_FILE_INDEXING),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { body: { content: { "application/json": { schema: z.any() } } } },
	responses: {
		200: jsonDesc("Indexing status"),
		401: E401[401],
		500: E500[500],
	},
});

export const routeBulkCheckFileIndexingStatus = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.RAG.BULK_CHECK_FILE_INDEXING),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { body: { content: { "application/json": { schema: z.any() } } } },
	responses: {
		200: jsonDesc("Bulk indexing status"),
		401: E401[401],
		500: E500[500],
	},
});
