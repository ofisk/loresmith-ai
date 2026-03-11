import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import {
	handleCancelRebuild,
	handleGetActiveRebuilds,
	handleGetRebuildHistory,
	handleGetRebuildStatus,
	handleTriggerRebuild,
} from "@/routes/graph-rebuild";
import { API_CONFIG } from "@/shared-config";

export function registerCampaignGraphRebuildRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.TRIGGER(":campaignId")
		),
		requireUserJwt,
		handleTriggerRebuild
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.STATUS(
				":campaignId",
				":rebuildId"
			)
		),
		requireUserJwt,
		handleGetRebuildStatus
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.HISTORY(":campaignId")
		),
		requireUserJwt,
		handleGetRebuildHistory
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.ACTIVE(":campaignId")
		),
		requireUserJwt,
		handleGetActiveRebuilds
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.CANCEL(
				":campaignId",
				":rebuildId"
			)
		),
		requireUserJwt,
		handleCancelRebuild
	);
}
