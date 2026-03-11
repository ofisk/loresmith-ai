import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import {
	handleGetNextActions,
	handleGetStateAnalysis,
	handleGetWelcomeGuidance,
} from "@/routes/onboarding";
import { API_CONFIG } from "@/shared-config";

export function registerOnboardingRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.ONBOARDING.WELCOME_GUIDANCE),
		requireUserJwt,
		handleGetWelcomeGuidance
	);
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.ONBOARDING.NEXT_ACTIONS),
		requireUserJwt,
		handleGetNextActions
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.ONBOARDING.CAMPAIGN_GUIDANCE(":campaignId")
		),
		requireUserJwt,
		handleGetStateAnalysis
	);
}
