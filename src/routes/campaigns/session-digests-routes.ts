import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import { ENDPOINTS } from "@/routes/endpoints";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import { CampaignIdParamSchema, ErrorSchema } from "@/routes/schemas/common";
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

const Error401 = {
	401: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Unauthorized",
	},
} as const;
const Error403 = {
	403: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Forbidden",
	},
} as const;
const Error404 = {
	404: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Not found",
	},
} as const;
const Error500 = {
	500: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Internal server error",
	},
} as const;

const CampaignIdDigestIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		digestId: z.string().openapi({ param: { name: "digestId", in: "path" } }),
	})
	.openapi("CampaignIdDigestIdParams");

const CampaignIdTemplateIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		templateId: z
			.string()
			.openapi({ param: { name: "templateId", in: "path" } }),
	})
	.openapi("CampaignIdTemplateIdParams");

const routeCreateSessionDigest = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.BASE("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdParamSchema,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		200: { description: "Session digest created" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetSessionDigests = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.BASE("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Session digests list" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetSessionDigest = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.DETAILS("{campaignId}", "{digestId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdDigestIdParams },
	responses: {
		200: { description: "Session digest details" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeUpdateSessionDigest = createRoute({
	method: "put",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.DETAILS("{campaignId}", "{digestId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdDigestIdParams,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		200: { description: "Session digest updated" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeDeleteSessionDigest = createRoute({
	method: "delete",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.DETAILS("{campaignId}", "{digestId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdDigestIdParams },
	responses: {
		200: { description: "Session digest deleted" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeSubmitDigestForReview = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.SUBMIT("{campaignId}", "{digestId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdDigestIdParams },
	responses: {
		200: { description: "Digest submitted for review" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeApproveDigest = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.APPROVE("{campaignId}", "{digestId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdDigestIdParams },
	responses: {
		200: { description: "Digest approved" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeRejectDigest = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.REJECT("{campaignId}", "{digestId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdDigestIdParams,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		200: { description: "Digest rejected" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeCreateSessionDigestTemplate = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.SESSION_DIGEST_TEMPLATES.BASE("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdParamSchema,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		200: { description: "Session digest template created" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetSessionDigestTemplates = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.SESSION_DIGEST_TEMPLATES.BASE("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Session digest templates list" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetSessionDigestTemplate = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.SESSION_DIGEST_TEMPLATES.DETAILS(
			"{campaignId}",
			"{templateId}"
		)
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdTemplateIdParams },
	responses: {
		200: { description: "Session digest template details" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeUpdateSessionDigestTemplate = createRoute({
	method: "put",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.SESSION_DIGEST_TEMPLATES.DETAILS(
			"{campaignId}",
			"{templateId}"
		)
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdTemplateIdParams,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		200: { description: "Session digest template updated" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeDeleteSessionDigestTemplate = createRoute({
	method: "delete",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.SESSION_DIGEST_TEMPLATES.DETAILS(
			"{campaignId}",
			"{templateId}"
		)
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdTemplateIdParams },
	responses: {
		200: { description: "Session digest template deleted" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

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
