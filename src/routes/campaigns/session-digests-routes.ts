import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import {
	routeApproveDigest,
	routeCreateSessionDigest,
	routeCreateSessionDigestTemplate,
	routeDeleteSessionDigest,
	routeDeleteSessionDigestTemplate,
	routeGetSessionDigest,
	routeGetSessionDigests,
	routeGetSessionDigestTemplate,
	routeGetSessionDigestTemplates,
	routeRejectDigest,
	routeSubmitDigestForReview,
	routeUpdateSessionDigest,
	routeUpdateSessionDigestTemplate,
} from "@/routes/campaigns/session-digests-routes-openapi";
import type { Env } from "@/routes/env";
import {
	handleCreateSessionDigestTemplate,
	handleDeleteSessionDigestTemplate,
	handleGetSessionDigestTemplate,
	handleGetSessionDigestTemplates,
	handleUpdateSessionDigestTemplate,
} from "@/routes/session-digest-templates";
import {
	handleApproveDigest,
	handleCreateSessionDigest,
	handleDeleteSessionDigest,
	handleGetSessionDigest,
	handleGetSessionDigests,
	handleRejectDigest,
	handleSubmitDigestForReview,
	handleUpdateSessionDigest,
} from "@/routes/session-digests";

export function registerCampaignSessionDigestsRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(
		routeCreateSessionDigest,
		handleCreateSessionDigest as unknown as Handler
	);
	app.openapi(
		routeGetSessionDigests,
		handleGetSessionDigests as unknown as Handler
	);
	app.openapi(
		routeGetSessionDigest,
		handleGetSessionDigest as unknown as Handler
	);
	app.openapi(
		routeUpdateSessionDigest,
		handleUpdateSessionDigest as unknown as Handler
	);
	app.openapi(
		routeDeleteSessionDigest,
		handleDeleteSessionDigest as unknown as Handler
	);
	app.openapi(
		routeSubmitDigestForReview,
		handleSubmitDigestForReview as unknown as Handler
	);
	app.openapi(routeApproveDigest, handleApproveDigest as unknown as Handler);
	app.openapi(routeRejectDigest, handleRejectDigest as unknown as Handler);
	app.openapi(
		routeCreateSessionDigestTemplate,
		handleCreateSessionDigestTemplate as unknown as Handler
	);
	app.openapi(
		routeGetSessionDigestTemplates,
		handleGetSessionDigestTemplates as unknown as Handler
	);
	app.openapi(
		routeGetSessionDigestTemplate,
		handleGetSessionDigestTemplate as unknown as Handler
	);
	app.openapi(
		routeUpdateSessionDigestTemplate,
		handleUpdateSessionDigestTemplate as unknown as Handler
	);
	app.openapi(
		routeDeleteSessionDigestTemplate,
		handleDeleteSessionDigestTemplate as unknown as Handler
	);
}
