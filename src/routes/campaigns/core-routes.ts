import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { optionalUserJwt, requireUserJwt } from "@/routes/auth";
import { handleCampaignJoin } from "@/routes/campaign-share";
import {
	handleAddResourceToCampaign,
	handleCleanupStuckEntityExtraction,
	handleCreateCampaign,
	handleDeleteAllCampaigns,
	handleDeleteCampaign,
	handleGetCampaign,
	handleGetCampaignResources,
	handleGetCampaigns,
	handleGetChecklistStatus,
	handleGetEntityExtractionStatus,
	handleProcessEntityExtractionQueue,
	handleRemoveResourceFromCampaign,
	handleRetryEntityExtraction,
	handleUpdateCampaign,
} from "@/routes/campaigns";
import { ENDPOINTS } from "@/routes/endpoints";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import { CampaignIdParamSchema, ErrorSchema } from "@/routes/schemas/common";

const Error400 = {
	400: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Bad request",
	},
} as const;
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

const CampaignIdResourceIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		resourceId: z
			.string()
			.openapi({ param: { name: "resourceId", in: "path" } }),
	})
	.openapi("CampaignIdResourceIdParams");

const CreateCampaignBodySchema = z
	.object({ name: z.string(), description: z.string().optional() })
	.openapi("CreateCampaignBody");
const UpdateCampaignBodySchema = z
	.object({ name: z.string().optional(), description: z.string().optional() })
	.openapi("UpdateCampaignBody");

const routeGetCampaigns = createRoute({
	method: "get",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.LIST),
	middleware: [requireUserJwt],
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ campaigns: z.array(z.any()) }),
				},
			},
			description: "Campaign list",
		},
		...Error401,
		...Error500,
	},
});

const routeCreateCampaign = createRoute({
	method: "post",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.CREATE),
	middleware: [requireUserJwt],
	request: {
		body: {
			content: { "application/json": { schema: CreateCampaignBodySchema } },
		},
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ campaign: z.unknown() }) },
			},
			description: "Campaign created",
		},
		...Error400,
		...Error401,
		...Error403,
		...Error500,
	},
});

const routeCampaignJoin = createRoute({
	method: "get",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.JOIN),
	middleware: [optionalUserJwt],
	request: { query: z.object({ linkId: z.string().optional() }) },
	responses: {
		200: { description: "Redirect or join response" },
		302: { description: "Redirect" },
		...Error400,
		...Error404,
		...Error500,
	},
});

const routeGetCampaign = createRoute({
	method: "get",
	path: toApiRoutePath("/campaigns/{campaignId}"),
	middleware: [requireUserJwt],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: {
			content: {
				"application/json": { schema: z.object({ campaign: z.unknown() }) },
			},
			description: "Campaign details",
		},
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetChecklistStatus = createRoute({
	method: "get",
	path: toApiRoutePath("/campaigns/{campaignId}/checklist-status"),
	middleware: [requireUserJwt],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Checklist status" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetCampaignResources = createRoute({
	method: "get",
	path: toApiRoutePath("/campaigns/{campaignId}/resources"),
	middleware: [requireUserJwt],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Campaign resources" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeAddResourceToCampaign = createRoute({
	method: "post",
	path: toApiRoutePath("/campaigns/{campaignId}/resource"),
	middleware: [requireUserJwt],
	request: {
		params: CampaignIdParamSchema,
		body: {
			content: {
				"application/json": {
					schema: z.object({
						type: z.string(),
						id: z.string(),
						name: z.string().optional(),
					}),
				},
			},
		},
	},
	responses: {
		200: { description: "Resource added" },
		...Error400,
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeRemoveResourceFromCampaign = createRoute({
	method: "delete",
	path: toApiRoutePath("/campaigns/{campaignId}/resource/{resourceId}"),
	middleware: [requireUserJwt],
	request: { params: CampaignIdResourceIdParams },
	responses: {
		200: { description: "Resource removed" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeRetryEntityExtraction = createRoute({
	method: "post",
	path: toApiRoutePath(
		"/campaigns/{campaignId}/resource/{resourceId}/retry-entity-extraction"
	),
	middleware: [requireUserJwt],
	request: { params: CampaignIdResourceIdParams },
	responses: {
		200: { description: "Retry initiated" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetEntityExtractionStatus = createRoute({
	method: "get",
	path: toApiRoutePath(
		"/campaigns/{campaignId}/resource/{resourceId}/entity-extraction-status"
	),
	middleware: [requireUserJwt],
	request: { params: CampaignIdResourceIdParams },
	responses: {
		200: { description: "Entity extraction status" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeCleanupStuckEntityExtraction = createRoute({
	method: "post",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.CLEANUP_STUCK_ENTITY_EXTRACTION),
	middleware: [requireUserJwt],
	responses: {
		200: { description: "Cleanup complete" },
		...Error401,
		...Error500,
	},
});

const routeProcessEntityExtractionQueue = createRoute({
	method: "post",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.PROCESS_ENTITY_EXTRACTION_QUEUE),
	middleware: [requireUserJwt],
	responses: {
		200: { description: "Queue processed" },
		...Error401,
		...Error500,
	},
});

const routeDeleteCampaign = createRoute({
	method: "delete",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.DELETE("{campaignId}")),
	middleware: [requireUserJwt],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Campaign deleted" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeUpdateCampaign = createRoute({
	method: "put",
	path: toApiRoutePath("/campaigns/{campaignId}"),
	middleware: [requireUserJwt],
	request: {
		params: CampaignIdParamSchema,
		body: {
			content: { "application/json": { schema: UpdateCampaignBodySchema } },
		},
	},
	responses: {
		200: { description: "Campaign updated" },
		...Error400,
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeDeleteAllCampaigns = createRoute({
	method: "delete",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.DELETE_ALL),
	middleware: [requireUserJwt],
	responses: {
		200: { description: "All campaigns deleted" },
		...Error401,
		...Error500,
	},
});

export function registerCampaignCoreRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(routeGetCampaigns, handleGetCampaigns as unknown as Handler);
	app.openapi(routeCreateCampaign, handleCreateCampaign as unknown as Handler);
	app.openapi(routeCampaignJoin, handleCampaignJoin as unknown as Handler);
	app.openapi(routeGetCampaign, handleGetCampaign as unknown as Handler);
	app.openapi(
		routeGetChecklistStatus,
		handleGetChecklistStatus as unknown as Handler
	);
	app.openapi(
		routeGetCampaignResources,
		handleGetCampaignResources as unknown as Handler
	);
	app.openapi(
		routeAddResourceToCampaign,
		handleAddResourceToCampaign as unknown as Handler
	);
	app.openapi(
		routeRemoveResourceFromCampaign,
		handleRemoveResourceFromCampaign as unknown as Handler
	);
	app.openapi(
		routeRetryEntityExtraction,
		handleRetryEntityExtraction as unknown as Handler
	);
	app.openapi(
		routeGetEntityExtractionStatus,
		handleGetEntityExtractionStatus as unknown as Handler
	);
	app.openapi(
		routeCleanupStuckEntityExtraction,
		handleCleanupStuckEntityExtraction as unknown as Handler
	);
	app.openapi(
		routeProcessEntityExtractionQueue,
		handleProcessEntityExtractionQueue as unknown as Handler
	);
	app.openapi(routeDeleteCampaign, handleDeleteCampaign as unknown as Handler);
	app.openapi(routeUpdateCampaign, handleUpdateCampaign as unknown as Handler);
	app.openapi(
		routeDeleteAllCampaigns,
		handleDeleteAllCampaigns as unknown as Handler
	);
}
