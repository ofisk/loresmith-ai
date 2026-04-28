import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { handlePostLibraryEntityBackfill } from "@/routes/admin/library-entity-backfill";
import { routePostLibraryEntityBackfill } from "@/routes/admin/library-entity-backfill-routes";
import type { Env } from "@/routes/env";

export function registerAdminRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(
		routePostLibraryEntityBackfill,
		handlePostLibraryEntityBackfill as unknown as Handler
	);
}
