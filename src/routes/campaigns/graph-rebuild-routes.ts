import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import {
	routeCancelRebuild,
	routeGetActiveRebuilds,
	routeGetRebuildHistory,
	routeGetRebuildStatus,
	routeTriggerRebuild,
} from "@/routes/campaigns/graph-rebuild-routes-openapi";
import type { Env } from "@/routes/env";
import {
	handleCancelRebuild,
	handleGetActiveRebuilds,
	handleGetRebuildHistory,
	handleGetRebuildStatus,
	handleTriggerRebuild,
} from "@/routes/graph-rebuild";

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
