import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";
import {
	handleMintStreamToken,
	handleNotificationPublish,
	handleNotificationStream,
} from "@/routes/notifications";
import {
	routeMintStreamToken,
	routeNotificationPublish,
	routeNotificationStream,
} from "@/routes/notifications/routes";

export function registerNotificationsRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(
		routeMintStreamToken,
		handleMintStreamToken as unknown as Handler
	);
	app.openapi(
		routeNotificationStream,
		handleNotificationStream as unknown as Handler
	);
	app.openapi(
		routeNotificationPublish,
		handleNotificationPublish as unknown as Handler
	);
}
