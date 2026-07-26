import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import {
	handleGetContinuityFindings,
	handleResolveContinuityFinding,
	handleScanCampaignContinuity,
} from "@/routes/continuity";
import { ENDPOINTS } from "@/routes/endpoints";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import { CampaignIdParamSchema, ErrorSchema } from "@/routes/schemas/common";

const ErrorResponses = {
	400: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Bad request",
	},
	401: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Unauthorized",
	},
	403: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Forbidden",
	},
	404: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Not found",
	},
	500: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Internal server error",
	},
} as const;

const CampaignIdFindingIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		findingId: z.string().openapi({ param: { name: "findingId", in: "path" } }),
	})
	.openapi("CampaignIdFindingIdParams");

const routeScanContinuity = createRoute({
	method: "post",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.CONTINUITY.SCAN("{campaignId}")),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdParamSchema,
		body: { content: { "application/json": { schema: z.any() } } },
	},
	responses: {
		200: { description: "Continuity scan completed" },
		...ErrorResponses,
	},
});

const routeGetContinuityFindings = createRoute({
	method: "get",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.CONTINUITY.FINDINGS("{campaignId}")),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Continuity findings list" },
		...ErrorResponses,
	},
});

const routeResolveContinuityFinding = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.CONTINUITY.RESOLVE_FINDING(
			"{campaignId}",
			"{findingId}"
		)
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdFindingIdParams,
		body: { content: { "application/json": { schema: z.any() } } },
	},
	responses: {
		200: { description: "Continuity finding resolved" },
		...ErrorResponses,
	},
});

export function registerCampaignContinuityRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(
		routeScanContinuity,
		handleScanCampaignContinuity as unknown as Handler
	);
	app.openapi(
		routeGetContinuityFindings,
		handleGetContinuityFindings as unknown as Handler
	);
	app.openapi(
		routeResolveContinuityFinding,
		handleResolveContinuityFinding as unknown as Handler
	);
}
