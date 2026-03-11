import type { Hono } from "hono";
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
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import {
	handleGetCommunityEntityGraph,
	handleGetGraphVisualization,
	handleSearchEntityInGraph,
} from "@/routes/graph-visualization";
import { API_CONFIG } from "@/shared-config";

export function registerCampaignCommunitiesRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.DETECT(":campaignId")
		),
		requireUserJwt,
		handleDetectCommunities
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.LIST(":campaignId")
		),
		requireUserJwt,
		handleListCommunities
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.DETAILS(
				":campaignId",
				":communityId"
			)
		),
		requireUserJwt,
		handleGetCommunity
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.BY_LEVEL(
				":campaignId",
				":level"
			)
		),
		requireUserJwt,
		handleGetCommunitiesByLevel
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.CHILDREN(
				":campaignId",
				":communityId"
			)
		),
		requireUserJwt,
		handleGetChildCommunities
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.HIERARCHY(":campaignId")
		),
		requireUserJwt,
		handleGetCommunityHierarchy
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_VISUALIZATION.BASE(":campaignId")
		),
		requireUserJwt,
		handleGetGraphVisualization
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_VISUALIZATION.COMMUNITY(
				":campaignId",
				":communityId"
			)
		),
		requireUserJwt,
		handleGetCommunityEntityGraph
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_VISUALIZATION.SEARCH_ENTITY(
				":campaignId"
			)
		),
		requireUserJwt,
		handleSearchEntityInGraph
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.SUMMARY(
				":campaignId",
				":communityId"
			)
		),
		requireUserJwt,
		handleGetCommunitySummary
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.SUMMARIES(":campaignId")
		),
		requireUserJwt,
		handleListCommunitySummaries
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.GENERATE_SUMMARY(
				":campaignId",
				":communityId"
			)
		),
		requireUserJwt,
		handleGenerateCommunitySummary
	);
}
