import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import {
	handleApproveShards,
	handleGenerateShardField,
	handleGetStagedShards,
	handleRejectShards,
	handleUpdateShard,
} from "@/routes/campaign-graphrag";
import { ENDPOINTS } from "@/routes/endpoints";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
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

const CampaignIdShardIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		shardId: z.string().openapi({ param: { name: "shardId", in: "path" } }),
	})
	.openapi("CampaignIdShardIdParams");

const routeApproveShards = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.APPROVE("{campaignId}")
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
		200: { description: "Shards approved" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeRejectShards = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.REJECT("{campaignId}")
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
		200: { description: "Shards rejected" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetStagedShards = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.STAGED_SHARDS("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Staged shards" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeApproveShardsBulk = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.APPROVE_SHARDS("{campaignId}")
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
		200: { description: "Shards approved" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeRejectShardsBulk = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.REJECT_SHARDS("{campaignId}")
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
		200: { description: "Shards rejected" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeUpdateShard = createRoute({
	method: "put",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.UPDATE_SHARD(
			"{campaignId}",
			"{shardId}"
		)
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdShardIdParams,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		200: { description: "Shard updated" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGenerateShardField = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.GENERATE_FIELD(
			"{campaignId}",
			"{shardId}"
		)
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdShardIdParams,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		200: { description: "Shard field generated" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export function registerCampaignGraphragRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(routeApproveShards, handleApproveShards as unknown as Handler);
	app.openapi(routeRejectShards, handleRejectShards as unknown as Handler);
	app.openapi(
		routeGetStagedShards,
		handleGetStagedShards as unknown as Handler
	);
	app.openapi(
		routeApproveShardsBulk,
		handleApproveShards as unknown as Handler
	);
	app.openapi(routeRejectShardsBulk, handleRejectShards as unknown as Handler);
	app.openapi(routeUpdateShard, handleUpdateShard as unknown as Handler);
	app.openapi(
		routeGenerateShardField,
		handleGenerateShardField as unknown as Handler
	);
}
