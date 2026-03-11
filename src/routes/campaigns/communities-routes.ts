import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import {
	handleDetectCommunities,
	handleGenerateCommunitySummary,
	handleGetChildCommunities,
	handleGetCommunitiesByLevel,
	handleGetCommunity,
	handleGetCommunityHierarchy,
	handleGetCommunitySummary,
	handleListCommunities,
	handleListCommunitySummaries,
} from "@/routes/communities";
import { ENDPOINTS } from "@/routes/endpoints";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import {
	handleGetCommunityEntityGraph,
	handleGetGraphVisualization,
	handleSearchEntityInGraph,
} from "@/routes/graph-visualization";
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

const CampaignIdCommunityIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		communityId: z
			.string()
			.openapi({ param: { name: "communityId", in: "path" } }),
	})
	.openapi("CampaignIdCommunityIdParams");

const CampaignIdLevelParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		level: z.string().openapi({ param: { name: "level", in: "path" } }),
	})
	.openapi("CampaignIdLevelParams");

const routeDetectCommunities = createRoute({
	method: "post",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.COMMUNITIES.DETECT("{campaignId}")),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Communities detected" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeListCommunities = createRoute({
	method: "get",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.COMMUNITIES.LIST("{campaignId}")),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Community list" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetCommunity = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.COMMUNITIES.DETAILS("{campaignId}", "{communityId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdCommunityIdParams },
	responses: {
		200: { description: "Community details" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetCommunitiesByLevel = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.COMMUNITIES.BY_LEVEL("{campaignId}", "{level}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdLevelParams },
	responses: {
		200: { description: "Communities by level" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetChildCommunities = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.COMMUNITIES.CHILDREN("{campaignId}", "{communityId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdCommunityIdParams },
	responses: {
		200: { description: "Child communities" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetCommunityHierarchy = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.COMMUNITIES.HIERARCHY("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Community hierarchy" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetGraphVisualization = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.GRAPH_VISUALIZATION.BASE("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Graph visualization" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetCommunityEntityGraph = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.GRAPH_VISUALIZATION.COMMUNITY(
			"{campaignId}",
			"{communityId}"
		)
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdCommunityIdParams },
	responses: {
		200: { description: "Community entity graph" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeSearchEntityInGraph = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.GRAPH_VISUALIZATION.SEARCH_ENTITY("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdParamSchema,
		query: z.object({ q: z.string().optional() }),
	},
	responses: {
		200: { description: "Entity search results" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetCommunitySummary = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.COMMUNITIES.SUMMARY("{campaignId}", "{communityId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdCommunityIdParams },
	responses: {
		200: { description: "Community summary" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeListCommunitySummaries = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.COMMUNITIES.SUMMARIES("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Community summaries" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGenerateCommunitySummary = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.COMMUNITIES.GENERATE_SUMMARY(
			"{campaignId}",
			"{communityId}"
		)
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdCommunityIdParams },
	responses: {
		200: { description: "Community summary generated" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export function registerCampaignCommunitiesRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(
		routeDetectCommunities,
		handleDetectCommunities as unknown as Handler
	);
	app.openapi(
		routeListCommunities,
		handleListCommunities as unknown as Handler
	);
	app.openapi(routeGetCommunity, handleGetCommunity as unknown as Handler);
	app.openapi(
		routeGetCommunitiesByLevel,
		handleGetCommunitiesByLevel as unknown as Handler
	);
	app.openapi(
		routeGetChildCommunities,
		handleGetChildCommunities as unknown as Handler
	);
	app.openapi(
		routeGetCommunityHierarchy,
		handleGetCommunityHierarchy as unknown as Handler
	);
	app.openapi(
		routeGetGraphVisualization,
		handleGetGraphVisualization as unknown as Handler
	);
	app.openapi(
		routeGetCommunityEntityGraph,
		handleGetCommunityEntityGraph as unknown as Handler
	);
	app.openapi(
		routeSearchEntityInGraph,
		handleSearchEntityInGraph as unknown as Handler
	);
	app.openapi(
		routeGetCommunitySummary,
		handleGetCommunitySummary as unknown as Handler
	);
	app.openapi(
		routeListCommunitySummaries,
		handleListCommunitySummaries as unknown as Handler
	);
	app.openapi(
		routeGenerateCommunitySummary,
		handleGenerateCommunitySummary as unknown as Handler
	);
}
