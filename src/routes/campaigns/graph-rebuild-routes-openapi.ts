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

const CampaignIdRebuildIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		rebuildId: z.string().openapi({ param: { name: "rebuildId", in: "path" } }),
	})
	.openapi("CampaignIdRebuildIdParams");

export const routeTriggerRebuild = createRoute({
	method: "post",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.TRIGGER("{campaignId}")
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

export const routeGetRebuildStatus = createRoute({
	method: "get",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.STATUS(
			"{campaignId}",
			"{rebuildId}"
		)
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

export const routeGetRebuildHistory = createRoute({
	method: "get",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.HISTORY("{campaignId}")
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

export const routeGetActiveRebuilds = createRoute({
	method: "get",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.ACTIVE("{campaignId}")
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

export const routeCancelRebuild = createRoute({
	method: "post",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.CANCEL(
			"{campaignId}",
			"{rebuildId}"
		)
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
