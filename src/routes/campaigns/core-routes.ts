import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { optionalUserJwt, requireUserJwt } from "@/routes/auth";
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
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import { API_CONFIG } from "@/shared-config";

export function registerCampaignCoreRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.LIST),
		requireUserJwt,
		handleGetCampaigns
	);
	app.post(
		toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.CREATE),
		requireUserJwt,
		handleCreateCampaign
	);
	// Join route: optionalUserJwt allows unauthenticated requests to reach the handler.
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.JOIN),
		optionalUserJwt,
		handleCampaignJoin
	);
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(":campaignId")),
		requireUserJwt,
		handleGetCampaign
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.CHECKLIST_STATUS(":campaignId")
		),
		requireUserJwt,
		handleGetChecklistStatus
	);
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCES(":campaignId")),
		requireUserJwt,
		handleGetCampaignResources
	);
	app.post(
		toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE(":campaignId")),
		requireUserJwt,
		handleAddResourceToCampaign
	);
	app.delete(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_DELETE(
				":campaignId",
				":resourceId"
			)
		),
		requireUserJwt,
		handleRemoveResourceFromCampaign
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.RETRY_ENTITY_EXTRACTION(
				":campaignId",
				":resourceId"
			)
		),
		requireUserJwt,
		handleRetryEntityExtraction
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITY_EXTRACTION_STATUS(
				":campaignId",
				":resourceId"
			)
		),
		requireUserJwt,
		handleGetEntityExtractionStatus
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.CLEANUP_STUCK_ENTITY_EXTRACTION
		),
		requireUserJwt,
		handleCleanupStuckEntityExtraction
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.PROCESS_ENTITY_EXTRACTION_QUEUE
		),
		requireUserJwt,
		handleProcessEntityExtractionQueue
	);
	app.delete(
		toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.DELETE(":campaignId")),
		requireUserJwt,
		handleDeleteCampaign
	);
	app.put(
		toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(":campaignId")),
		requireUserJwt,
		handleUpdateCampaign
	);
	app.delete(
		toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.DELETE_ALL),
		requireUserJwt,
		handleDeleteAllCampaigns
	);
}
