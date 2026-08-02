import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";
import {
	handleCreateExperiment,
	handleDeleteExperiment,
	handleGetAssignments,
	handleGetExperimentResults,
	handleListExperiments,
	handleUpdateExperiment,
} from "@/routes/experiments";
import {
	routeCreateExperiment,
	routeDeleteExperiment,
	routeGetAssignments,
	routeGetExperimentResults,
	routeListExperiments,
	routeUpdateExperiment,
} from "@/routes/experiments/routes";

export function registerExperimentRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(routeGetAssignments, handleGetAssignments as unknown as Handler);
	app.openapi(
		routeListExperiments,
		handleListExperiments as unknown as Handler
	);
	app.openapi(
		routeCreateExperiment,
		handleCreateExperiment as unknown as Handler
	);
	// Registered before the generic :key routes only for readability; Hono matches
	// on method + literal segment, so /:key/results and /:key do not collide.
	app.openapi(
		routeGetExperimentResults,
		handleGetExperimentResults as unknown as Handler
	);
	app.openapi(
		routeUpdateExperiment,
		handleUpdateExperiment as unknown as Handler
	);
	app.openapi(
		routeDeleteExperiment,
		handleDeleteExperiment as unknown as Handler
	);
}
