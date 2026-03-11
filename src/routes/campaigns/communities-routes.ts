import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import {
	routeDetectCommunities,
	routeGenerateCommunitySummary,
	routeGetChildCommunities,
	routeGetCommunitiesByLevel,
	routeGetCommunity,
	routeGetCommunityEntityGraph,
	routeGetCommunityHierarchy,
	routeGetCommunitySummary,
	routeGetGraphVisualization,
	routeListCommunities,
	routeListCommunitySummaries,
	routeSearchEntityInGraph,
} from "@/routes/campaigns/communities-routes-openapi";
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
import type { Env } from "@/routes/env";
import {
	handleGetCommunityEntityGraph,
	handleGetGraphVisualization,
	handleSearchEntityInGraph,
} from "@/routes/graph-visualization";

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
