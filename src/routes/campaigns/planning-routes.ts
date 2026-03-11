import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import {
	routeAssembleContext,
	routeBulkCompletePlanningTasks,
	routeCreatePlanningTask,
	routeDeletePlanningTask,
	routeGetPlanningTasks,
	routeGetRecentPlanningContext,
	routeSearchPlanningContext,
	routeUpdatePlanningTask,
} from "@/routes/campaigns/planning-routes-openapi";
import { handleAssembleContext } from "@/routes/context-assembly";
import type { Env } from "@/routes/env";
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

export function registerCampaignPlanningRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(
		routeGetPlanningTasks,
		handleGetPlanningTasks as unknown as Handler
	);
	app.openapi(
		routeCreatePlanningTask,
		handleCreatePlanningTask as unknown as Handler
	);
	app.openapi(
		routeUpdatePlanningTask,
		handleUpdatePlanningTask as unknown as Handler
	);
	app.openapi(
		routeDeletePlanningTask,
		handleDeletePlanningTask as unknown as Handler
	);
	app.openapi(
		routeBulkCompletePlanningTasks,
		handleBulkCompletePlanningTasks as unknown as Handler
	);
	app.openapi(
		routeSearchPlanningContext,
		handleSearchPlanningContext as unknown as Handler
	);
	app.openapi(
		routeGetRecentPlanningContext,
		handleGetRecentPlanningContext as unknown as Handler
	);
	app.openapi(
		routeAssembleContext,
		handleAssembleContext as unknown as Handler
	);
}
