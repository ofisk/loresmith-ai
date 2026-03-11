import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import {
	handleGetAssessmentRecommendations,
	handleGetUserActivity,
	handleGetUserState,
	handleModuleIntegration,
} from "@/routes/assessment";
import { requireUserJwt } from "@/routes/auth";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import { API_CONFIG } from "@/shared-config";

export function registerAssessmentRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.ASSESSMENT.USER_STATE),
		requireUserJwt,
		handleGetUserState
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.ASSESSMENT.CAMPAIGN_READINESS(":campaignId")
		),
		requireUserJwt,
		handleGetAssessmentRecommendations
	);
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.ASSESSMENT.USER_ACTIVITY),
		requireUserJwt,
		handleGetUserActivity
	);
	app.post(
		toApiRoutePath(API_CONFIG.ENDPOINTS.ASSESSMENT.MODULE_INTEGRATION),
		requireUserJwt,
		handleModuleIntegration
	);
}
