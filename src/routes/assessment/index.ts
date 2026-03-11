import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import {
	handleGetAssessmentRecommendations,
	handleGetUserActivity,
	handleGetUserState,
	handleModuleIntegration,
} from "@/routes/assessment";
import {
	routeGetAssessmentRecommendations,
	routeGetUserActivity,
	routeGetUserState,
	routeModuleIntegration,
} from "@/routes/assessment/routes";
import type { Env } from "@/routes/env";

export function registerAssessmentRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(routeGetUserState, handleGetUserState as unknown as Handler);
	app.openapi(
		routeGetAssessmentRecommendations,
		handleGetAssessmentRecommendations as unknown as Handler
	);
	app.openapi(
		routeGetUserActivity,
		handleGetUserActivity as unknown as Handler
	);
	app.openapi(
		routeModuleIntegration,
		handleModuleIntegration as unknown as Handler
	);
}
