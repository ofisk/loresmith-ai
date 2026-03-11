import { createRoute, z } from "@hono/zod-openapi";
import { requireUserJwt } from "@/routes/auth";
import { ErrorSchema } from "@/routes/schemas/common";
import { API_CONFIG } from "@/shared-config";
import { toApiRoutePath } from "../env";

const E401 = {
	401: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Unauthorized",
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

export const routeGetRecommendations = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.EXTERNAL_RESOURCES.RECOMMENDATIONS),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("Recommendations"), ...E401, ...E500 },
});

export const routeGetInspirationSources = createRoute({
	method: "get",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.EXTERNAL_RESOURCES.INSPIRATION_SOURCES
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("Inspiration sources"), ...E401, ...E500 },
});

export const routeGetGmResources = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.EXTERNAL_RESOURCES.GM_RESOURCES),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("GM resources"), ...E401, ...E500 },
});
