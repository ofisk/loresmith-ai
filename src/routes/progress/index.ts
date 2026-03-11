import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import { handleProgressWebSocket } from "@/routes/progress";
import { API_CONFIG } from "@/shared-config";

export function registerProgressRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.PROGRESS.WEBSOCKET),
		handleProgressWebSocket
	);
}
