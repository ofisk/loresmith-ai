import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";
import { registerCampaignCommunitiesRoutes } from "./communities-routes";
import { registerCampaignCoreRoutes } from "./core-routes";
import { registerCampaignEntitiesRoutes } from "./entities-routes";
import { registerCampaignGraphRebuildRoutes } from "./graph-rebuild-routes";
import { registerCampaignGraphragRoutes } from "./graphrag-routes";
import { registerCampaignPlanningRoutes } from "./planning-routes";
import { registerCampaignSessionDigestsRoutes } from "./session-digests-routes";
import { registerCampaignShareRoutes } from "./share-routes";
import { registerCampaignWorldStateRoutes } from "./world-state-routes";

export function registerCampaignRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	registerCampaignCoreRoutes(app);
	registerCampaignPlanningRoutes(app);
	registerCampaignShareRoutes(app);
	registerCampaignWorldStateRoutes(app);
	registerCampaignSessionDigestsRoutes(app);
	registerCampaignEntitiesRoutes(app);
	registerCampaignCommunitiesRoutes(app);
	registerCampaignGraphragRoutes(app);
	registerCampaignGraphRebuildRoutes(app);
}
