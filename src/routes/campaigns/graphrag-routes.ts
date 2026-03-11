import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import {
	handleApproveShards,
	handleGenerateShardField,
	handleGetStagedShards,
	handleRejectShards,
	handleUpdateShard,
} from "@/routes/campaign-graphrag";
import {
	routeApproveShards,
	routeApproveShardsBulk,
	routeGenerateShardField,
	routeGetStagedShards,
	routeRejectShards,
	routeRejectShardsBulk,
	routeUpdateShard,
} from "@/routes/campaigns/graphrag-routes-openapi";
import type { Env } from "@/routes/env";

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
