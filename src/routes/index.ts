import type { OpenAPIHono } from "@hono/zod-openapi";
import type { RequestLogger } from "@/lib/logger";
import { registerAppRoutes } from "@/routes/app/index";
import { registerAssessmentRoutes } from "@/routes/assessment/index";
import { registerAuthRoutes } from "@/routes/auth/index";
import { registerBillingRoutes } from "@/routes/billing/index";
import { registerCampaignRoutes } from "@/routes/campaigns/index";
import { registerChatRoutes } from "@/routes/chat/index";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import { registerExternalResourcesRoutes } from "@/routes/external-resources/index";
import fileAnalysisRoutes from "@/routes/file-analysis";
import { registerLibraryRoutes } from "@/routes/library/index";
import { registerNotificationsRoutes } from "@/routes/notifications/index";
import { registerOnboardingRoutes } from "@/routes/onboarding/index";
import { registerOpenAPIRoutes } from "@/routes/openapi";
import { registerProgressRoutes } from "@/routes/progress/index";
import { registerRagRoutes } from "@/routes/rag/index";
import { registerTelemetryRoutes } from "@/routes/telemetry/index";
import { registerUploadRoutes } from "@/routes/upload/index";
import { API_CONFIG } from "@/shared-config";

export type { Env } from "./env";

export function registerRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	registerOpenAPIRoutes(app);
	registerAuthRoutes(app);
	registerBillingRoutes(app);
	registerRagRoutes(app);
	app.route(
		toApiRoutePath(API_CONFIG.ENDPOINTS.FILE_ANALYSIS.BASE),
		fileAnalysisRoutes
	);
	registerCampaignRoutes(app);
	registerProgressRoutes(app);
	registerAssessmentRoutes(app);
	registerOnboardingRoutes(app);
	registerExternalResourcesRoutes(app);
	registerTelemetryRoutes(app);
	registerLibraryRoutes(app);
	registerNotificationsRoutes(app);
	registerUploadRoutes(app);
	registerChatRoutes(app);
	registerAppRoutes(app);
}
