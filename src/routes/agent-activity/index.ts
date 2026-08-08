import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import {
	handleGetAgentActivitySummary,
	handleGetAgentActivityTree,
	handleListAgentActivity,
} from "@/routes/agent-activity";
import {
	routeGetAgentActivitySummary,
	routeGetAgentActivityTree,
	routeListAgentActivity,
} from "@/routes/agent-activity/routes";
import type { Env } from "@/routes/env";

export function registerAgentActivityRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	// `/summary` before the list only for readability; Hono matches on method
	// plus literal segment, so the three paths cannot collide.
	app.openapi(
		routeGetAgentActivitySummary,
		handleGetAgentActivitySummary as unknown as Handler
	);
	app.openapi(
		routeGetAgentActivityTree,
		handleGetAgentActivityTree as unknown as Handler
	);
	app.openapi(
		routeListAgentActivity,
		handleListAgentActivity as unknown as Handler
	);
}
