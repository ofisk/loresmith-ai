import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import {
	handleGetExternalResourceRecommendations,
	handleGetExternalResourceSearch,
	handleGetGmResources,
} from "@/routes/external-resources";
import { API_CONFIG } from "@/shared-config";

export function registerExternalResourcesRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.EXTERNAL_RESOURCES.RECOMMENDATIONS),
		requireUserJwt,
		handleGetExternalResourceRecommendations
	);
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.EXTERNAL_RESOURCES.INSPIRATION_SOURCES),
		requireUserJwt,
		handleGetExternalResourceSearch
	);
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.EXTERNAL_RESOURCES.GM_RESOURCES),
		requireUserJwt,
		handleGetGmResources
	);
}
