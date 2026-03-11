import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";
import { handleProgressWebSocket } from "@/routes/progress";
import { routeProgressWebSocket } from "@/routes/progress/routes";

export function registerProgressRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(
		routeProgressWebSocket,
		handleProgressWebSocket as unknown as Handler
	);
}
