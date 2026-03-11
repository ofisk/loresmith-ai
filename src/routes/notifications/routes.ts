import { createRoute, z } from "@hono/zod-openapi";
import { toApiRoutePath } from "@/routes/env";
import { ErrorSchema } from "@/routes/schemas/common";
import { API_CONFIG } from "@/shared-config";

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

export const routeMintStreamToken = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.NOTIFICATIONS.MINT_STREAM),
	responses: { 200: jsonDesc("Stream URL and token"), ...E401, ...E500 },
});

export const routeNotificationStream = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.NOTIFICATIONS.STREAM),
	responses: { 200: jsonDesc("SSE stream"), ...E401, ...E500 },
});

export const routeNotificationPublish = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.NOTIFICATIONS.PUBLISH),
	request: { body: { content: { "application/json": { schema: z.any() } } } },
	responses: { 200: jsonDesc("Publish result"), ...E401, ...E500 },
});
