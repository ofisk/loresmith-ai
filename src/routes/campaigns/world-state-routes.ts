import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import { ENDPOINTS } from "@/routes/endpoints";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import { CampaignIdParamSchema, ErrorSchema } from "@/routes/schemas/common";
import {
	handleCreateWorldStateChangelog,
	handleGetHistoricalOverlay,
	handleGetWorldStateOverlay,
	handleListWorldStateChangelog,
	handleQueryHistoricalState,
} from "@/routes/world-state";

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

const routeCreateWorldStateChangelog = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.WORLD_STATE.CHANGELOG("{campaignId}")
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

const routeListWorldStateChangelog = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.WORLD_STATE.CHANGELOG("{campaignId}")
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

const routeGetWorldStateOverlay = createRoute({
	method: "get",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.WORLD_STATE.OVERLAY("{campaignId}")),
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

const routeQueryHistoricalState = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.WORLD_STATE.HISTORICAL_QUERY("{campaignId}")
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

const routeGetHistoricalOverlay = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.WORLD_STATE.HISTORICAL_OVERLAY("{campaignId}")
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

export function registerCampaignWorldStateRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(
		routeCreateWorldStateChangelog,
		handleCreateWorldStateChangelog as unknown as Handler
	);
	app.openapi(
		routeListWorldStateChangelog,
		handleListWorldStateChangelog as unknown as Handler
	);
	app.openapi(
		routeGetWorldStateOverlay,
		handleGetWorldStateOverlay as unknown as Handler
	);
	app.openapi(
		routeQueryHistoricalState,
		handleQueryHistoricalState as unknown as Handler
	);
	app.openapi(
		routeGetHistoricalOverlay,
		handleGetHistoricalOverlay as unknown as Handler
	);
}
