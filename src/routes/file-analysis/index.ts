import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";
import {
	handleAnalyzeAll,
	handleAnalyzeFile,
	handleGetPending,
	handleGetRecommendations,
	handleGetStatus,
} from "@/routes/file-analysis/handlers";
import {
	routeAnalyzeAll,
	routeAnalyzeFile,
	routeGetPending,
	routeGetRecommendations,
	routeGetStatus,
} from "@/routes/file-analysis/routes";

export function registerFileAnalysisRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(routeAnalyzeFile, handleAnalyzeFile as unknown as Handler);
	app.openapi(routeGetStatus, handleGetStatus as unknown as Handler);
	app.openapi(routeGetPending, handleGetPending as unknown as Handler);
	app.openapi(
		routeGetRecommendations,
		handleGetRecommendations as unknown as Handler
	);
	app.openapi(routeAnalyzeAll, handleAnalyzeAll as unknown as Handler);
}
