import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import {
	handleCreateWorldStateChangelog,
	handleGetHistoricalOverlay,
	handleGetWorldStateOverlay,
	handleListWorldStateChangelog,
	handleQueryHistoricalState,
} from "@/routes/world-state";
import { API_CONFIG } from "@/shared-config";

export function registerCampaignWorldStateRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.CHANGELOG(":campaignId")
		),
		requireUserJwt,
		handleCreateWorldStateChangelog
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.CHANGELOG(":campaignId")
		),
		requireUserJwt,
		handleListWorldStateChangelog
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.OVERLAY(":campaignId")
		),
		requireUserJwt,
		handleGetWorldStateOverlay
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.HISTORICAL_QUERY(":campaignId")
		),
		requireUserJwt,
		handleQueryHistoricalState
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.HISTORICAL_OVERLAY(
				":campaignId"
			)
		),
		requireUserJwt,
		handleGetHistoricalOverlay
	);
}
