import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import {
	handleApproveShards,
	handleGenerateShardField,
	handleGetStagedShards,
	handleRejectShards,
	handleUpdateShard,
} from "@/routes/campaign-graphrag";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import { API_CONFIG } from "@/shared-config";

export function registerCampaignGraphragRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.APPROVE(":campaignId")
		),
		requireUserJwt,
		handleApproveShards
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.REJECT(":campaignId")
		),
		requireUserJwt,
		handleRejectShards
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.STAGED_SHARDS(
				":campaignId"
			)
		),
		requireUserJwt,
		handleGetStagedShards
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.APPROVE_SHARDS(
				":campaignId"
			)
		),
		requireUserJwt,
		handleApproveShards
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.REJECT_SHARDS(
				":campaignId"
			)
		),
		requireUserJwt,
		handleRejectShards
	);
	app.put(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.UPDATE_SHARD(
				":campaignId",
				":shardId"
			)
		),
		requireUserJwt,
		handleUpdateShard
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.GENERATE_FIELD(
				":campaignId",
				":shardId"
			)
		),
		requireUserJwt,
		handleGenerateShardField
	);
}
