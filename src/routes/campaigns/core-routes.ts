import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
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
import {
	routeAddResourceToCampaign,
	routeCampaignJoin,
	routeCleanupStuckEntityExtraction,
	routeCreateCampaign,
	routeDeleteAllCampaigns,
	routeDeleteCampaign,
	routeGetCampaign,
	routeGetCampaignResources,
	routeGetCampaigns,
	routeGetChecklistStatus,
	routeGetEntityExtractionStatus,
	routeProcessEntityExtractionQueue,
	routeRemoveResourceFromCampaign,
	routeRetryEntityExtraction,
	routeUpdateCampaign,
} from "@/routes/campaigns/core-routes-openapi";
import type { Env } from "@/routes/env";

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
