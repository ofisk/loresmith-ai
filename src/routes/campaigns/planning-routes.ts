import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import { handleAssembleContext } from "@/routes/context-assembly";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import {
	handleGetRecentPlanningContext,
	handleSearchPlanningContext,
} from "@/routes/planning-context";
import {
	handleBulkCompletePlanningTasks,
	handleCreatePlanningTask,
	handleDeletePlanningTask,
	handleGetPlanningTasks,
	handleUpdatePlanningTask,
} from "@/routes/planning-tasks";
import { API_CONFIG } from "@/shared-config";

export function registerCampaignPlanningRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_TASKS.BASE(":campaignId")
		),
		requireUserJwt,
		handleGetPlanningTasks
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_TASKS.BASE(":campaignId")
		),
		requireUserJwt,
		handleCreatePlanningTask
	);
	app.patch(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_TASKS.DETAILS(
				":campaignId",
				":taskId"
			)
		),
		requireUserJwt,
		handleUpdatePlanningTask
	);
	app.delete(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_TASKS.DETAILS(
				":campaignId",
				":taskId"
			)
		),
		requireUserJwt,
		handleDeletePlanningTask
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_TASKS.COMPLETE_BULK(":campaignId")
		),
		requireUserJwt,
		handleBulkCompletePlanningTasks
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_CONTEXT.SEARCH(":campaignId")
		),
		requireUserJwt,
		handleSearchPlanningContext
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_CONTEXT.RECENT(":campaignId")
		),
		requireUserJwt,
		handleGetRecentPlanningContext
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.CONTEXT_ASSEMBLY(":campaignId")
		),
		requireUserJwt,
		handleAssembleContext
	);
}
