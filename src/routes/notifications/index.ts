import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import {
	handleMintStreamToken,
	handleNotificationPublish,
	handleNotificationStream,
} from "@/routes/notifications";
import { API_CONFIG } from "@/shared-config";

export function registerNotificationsRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.post(
		toApiRoutePath(API_CONFIG.ENDPOINTS.NOTIFICATIONS.MINT_STREAM),
		handleMintStreamToken
	);
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.NOTIFICATIONS.STREAM),
		handleNotificationStream
	);
	app.post(
		toApiRoutePath(API_CONFIG.ENDPOINTS.NOTIFICATIONS.PUBLISH),
		handleNotificationPublish
	);
}
