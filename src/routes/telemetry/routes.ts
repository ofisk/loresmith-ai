import { createRoute, z } from "@hono/zod-openapi";
import { requireUserJwt } from "@/routes/auth";
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

export const routeRecordSatisfactionRating = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.TELEMETRY.RATINGS),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { body: { content: { "application/json": { schema: z.any() } } } },
	responses: { 200: jsonDesc("Success"), ...E401, ...E500 },
});

export const routeRecordContextAccuracy = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.TELEMETRY.CONTEXT_ACCURACY),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { body: { content: { "application/json": { schema: z.any() } } } },
	responses: { 200: jsonDesc("Success"), ...E401, ...E500 },
});

export const routeGetMetrics = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.ADMIN.TELEMETRY.METRICS),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("Metrics"), ...E401, ...E500 },
});

export const routeGetDashboard = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.ADMIN.TELEMETRY.DASHBOARD),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("Dashboard"), ...E401, ...E500 },
});

export const routeGetAdminTelemetryOverview = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.ADMIN.TELEMETRY.OVERVIEW),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("Overview"), ...E401, ...E500 },
});

export const routeGetAlerts = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.ADMIN.TELEMETRY.ALERTS),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("Alerts"), ...E401, ...E500 },
});
