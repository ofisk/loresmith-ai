import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import {
	routeCreateWorldStateChangelog,
	routeGetHistoricalOverlay,
	routeGetWorldStateOverlay,
	routeListWorldStateChangelog,
	routeQueryHistoricalState,
} from "@/routes/campaigns/world-state-routes-openapi";
import type { Env } from "@/routes/env";
import {
	handleCreateWorldStateChangelog,
	handleGetHistoricalOverlay,
	handleGetWorldStateOverlay,
	handleListWorldStateChangelog,
	handleQueryHistoricalState,
} from "@/routes/world-state";

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
