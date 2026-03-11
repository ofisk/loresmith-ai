import { createRoute, z } from "@hono/zod-openapi";
import { requireUserJwt } from "@/routes/auth";
import { CampaignIdParamSchema, ErrorSchema } from "@/routes/schemas/common";
import { API_CONFIG } from "@/shared-config";
import { toApiRoutePath } from "../env";

const Error401 = {
	401: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Unauthorized",
	},
} as const;
const Error403 = {
	403: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Forbidden",
	},
} as const;
const Error404 = {
	404: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Not found",
	},
} as const;
const Error500 = {
	500: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Internal server error",
	},
} as const;

export const routeCreateWorldStateChangelog = createRoute({
	method: "post",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.CHANGELOG("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdParamSchema,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		200: { description: "World state changelog created" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeListWorldStateChangelog = createRoute({
	method: "get",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.CHANGELOG("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "World state changelog list" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeGetWorldStateOverlay = createRoute({
	method: "get",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.OVERLAY("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "World state overlay" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeQueryHistoricalState = createRoute({
	method: "post",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.HISTORICAL_QUERY("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdParamSchema,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		200: { description: "Historical state query result" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeGetHistoricalOverlay = createRoute({
	method: "get",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.HISTORICAL_OVERLAY(
			"{campaignId}"
		)
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Historical overlay" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});
