import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";
import {
	handleGetExternalResourceRecommendations,
	handleGetExternalResourceSearch,
	handleGetGmResources,
} from "@/routes/external-resources";
import {
	routeGetGmResources,
	routeGetInspirationSources,
	routeGetRecommendations,
} from "@/routes/external-resources/routes";

export function registerExternalResourcesRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(
		routeGetRecommendations,
		handleGetExternalResourceRecommendations as unknown as Handler
	);
	app.openapi(
		routeGetInspirationSources,
		handleGetExternalResourceSearch as unknown as Handler
	);
	app.openapi(routeGetGmResources, handleGetGmResources as unknown as Handler);
}
