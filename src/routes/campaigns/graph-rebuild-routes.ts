import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import { ENDPOINTS } from "@/routes/endpoints";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import {
	handleCancelRebuild,
	handleGetActiveRebuilds,
	handleGetRebuildHistory,
	handleGetRebuildStatus,
	handleTriggerRebuild,
} from "@/routes/graph-rebuild";
import { CampaignIdParamSchema, ErrorSchema } from "@/routes/schemas/common";

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

const CampaignIdRebuildIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		rebuildId: z.string().openapi({ param: { name: "rebuildId", in: "path" } }),
	})
	.openapi("CampaignIdRebuildIdParams");

const routeTriggerRebuild = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.TRIGGER("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Rebuild triggered" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetRebuildStatus = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.STATUS("{campaignId}", "{rebuildId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdRebuildIdParams },
	responses: {
		200: { description: "Rebuild status" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetRebuildHistory = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.HISTORY("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Rebuild history" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetActiveRebuilds = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.ACTIVE("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Active rebuilds" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeCancelRebuild = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.CANCEL("{campaignId}", "{rebuildId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdRebuildIdParams },
	responses: {
		200: { description: "Rebuild cancelled" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export function registerCampaignGraphRebuildRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(routeTriggerRebuild, handleTriggerRebuild as unknown as Handler);
	app.openapi(
		routeGetRebuildStatus,
		handleGetRebuildStatus as unknown as Handler
	);
	app.openapi(
		routeGetRebuildHistory,
		handleGetRebuildHistory as unknown as Handler
	);
	app.openapi(
		routeGetActiveRebuilds,
		handleGetActiveRebuilds as unknown as Handler
	);
	app.openapi(routeCancelRebuild, handleCancelRebuild as unknown as Handler);
}
