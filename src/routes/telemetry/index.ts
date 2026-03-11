import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import {
	handleGetAlerts,
	handleGetDashboard,
	handleGetMetrics,
	handleRecordContextAccuracy,
	handleRecordSatisfactionRating,
} from "@/routes/telemetry";
import { API_CONFIG } from "@/shared-config";

export function registerTelemetryRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	// Telemetry endpoints
	app.post(
		toApiRoutePath(API_CONFIG.ENDPOINTS.TELEMETRY.RATINGS),
		requireUserJwt,
		handleRecordSatisfactionRating
	);
	app.post(
		toApiRoutePath(API_CONFIG.ENDPOINTS.TELEMETRY.CONTEXT_ACCURACY),
		requireUserJwt,
		handleRecordContextAccuracy
	);

	// Admin telemetry endpoints
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.ADMIN.TELEMETRY.METRICS),
		requireUserJwt,
		handleGetMetrics
	);
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.ADMIN.TELEMETRY.DASHBOARD),
		requireUserJwt,
		handleGetDashboard
	);
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.ADMIN.TELEMETRY.ALERTS),
		requireUserJwt,
		handleGetAlerts
	);
}
