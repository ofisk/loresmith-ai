import { createRoute, z } from "@hono/zod-openapi";
import { requireUserJwt } from "@/routes/auth";
import { toApiRoutePath } from "@/routes/env";
import { ErrorSchema } from "@/routes/schemas/common";
import { API_CONFIG } from "@/shared-config";

const FileKeyParamSchema = z.object({
	fileKey: z.string().openapi({ param: { name: "fileKey", in: "path" } }),
});

const E401 = {
	401: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Unauthorized",
	},
} as const;
const E404 = {
	404: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "File not found",
	},
} as const;
const E500 = {
	500: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Internal server error",
	},
} as const;
const jsonDesc = (d: string) => ({
	content: { "application/json": { schema: z.any() } } as const,
	description: d,
});

export const routeAnalyzeFile = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.FILE_ANALYSIS.ANALYZE("{fileKey}")),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: FileKeyParamSchema },
	responses: {
		200: jsonDesc("Analysis result"),
		...E401,
		...E404,
		...E500,
	},
});

export const routeGetStatus = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.FILE_ANALYSIS.STATUS("{fileKey}")),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: FileKeyParamSchema },
	responses: { 200: jsonDesc("Analysis status"), ...E401, ...E404, ...E500 },
});

export const routeGetPending = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.FILE_ANALYSIS.PENDING),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("Pending files"), ...E401, ...E500 },
});

export const routeGetRecommendations = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.FILE_ANALYSIS.RECOMMENDATIONS),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { body: { content: { "application/json": { schema: z.any() } } } },
	responses: { 200: jsonDesc("Recommendations"), ...E401, ...E500 },
});

export const routeAnalyzeAll = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.FILE_ANALYSIS.ANALYZE_ALL),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("Batch analysis result"), ...E401, ...E500 },
});
