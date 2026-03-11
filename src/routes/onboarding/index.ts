import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";
import {
	handleGetNextActions,
	handleGetStateAnalysis,
	handleGetWelcomeGuidance,
} from "@/routes/onboarding";
import {
	routeGetNextActions,
	routeGetStateAnalysis,
	routeGetWelcomeGuidance,
} from "@/routes/onboarding/routes";

export function registerOnboardingRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(
		routeGetWelcomeGuidance,
		handleGetWelcomeGuidance as unknown as Handler
	);
	app.openapi(routeGetNextActions, handleGetNextActions as unknown as Handler);
	app.openapi(
		routeGetStateAnalysis,
		handleGetStateAnalysis as unknown as Handler
	);
}
