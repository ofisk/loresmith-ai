import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";
import {
	handleGetAdminTelemetryOverview,
	handleGetAlerts,
	handleGetDashboard,
	handleGetMetrics,
	handleRecordContextAccuracy,
	handleRecordSatisfactionRating,
} from "@/routes/telemetry";
import {
	routeGetAdminTelemetryOverview,
	routeGetAlerts,
	routeGetDashboard,
	routeGetMetrics,
	routeRecordContextAccuracy,
	routeRecordSatisfactionRating,
} from "@/routes/telemetry/routes";

export function registerTelemetryRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(
		routeRecordSatisfactionRating,
		handleRecordSatisfactionRating as unknown as Handler
	);
	app.openapi(
		routeRecordContextAccuracy,
		handleRecordContextAccuracy as unknown as Handler
	);
	app.openapi(routeGetMetrics, handleGetMetrics as unknown as Handler);
	app.openapi(routeGetDashboard, handleGetDashboard as unknown as Handler);
	app.openapi(
		routeGetAdminTelemetryOverview,
		handleGetAdminTelemetryOverview as unknown as Handler
	);
	app.openapi(routeGetAlerts, handleGetAlerts as unknown as Handler);
}
