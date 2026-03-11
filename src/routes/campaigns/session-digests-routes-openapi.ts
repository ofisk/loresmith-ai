import { createRoute, z } from "@hono/zod-openapi";
import { requireUserJwt } from "@/routes/auth";
import { CampaignIdParamSchema, ErrorSchema } from "@/routes/schemas/common";
import { API_CONFIG } from "@/shared-config";
import { toApiRoutePath } from "../env";

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

export const routeCreateSessionDigest = createRoute({
	method: "post",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.BASE("{campaignId}")
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

export const routeGetSessionDigests = createRoute({
	method: "get",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.BASE("{campaignId}")
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

export const routeGetSessionDigest = createRoute({
	method: "get",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.DETAILS(
			"{campaignId}",
			"{digestId}"
		)
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

export const routeUpdateSessionDigest = createRoute({
	method: "put",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.DETAILS(
			"{campaignId}",
			"{digestId}"
		)
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

export const routeDeleteSessionDigest = createRoute({
	method: "delete",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.DETAILS(
			"{campaignId}",
			"{digestId}"
		)
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

export const routeSubmitDigestForReview = createRoute({
	method: "post",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.SUBMIT(
			"{campaignId}",
			"{digestId}"
		)
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

export const routeApproveDigest = createRoute({
	method: "post",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.APPROVE(
			"{campaignId}",
			"{digestId}"
		)
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

export const routeRejectDigest = createRoute({
	method: "post",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.REJECT(
			"{campaignId}",
			"{digestId}"
		)
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

export const routeCreateSessionDigestTemplate = createRoute({
	method: "post",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGEST_TEMPLATES.BASE("{campaignId}")
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

export const routeGetSessionDigestTemplates = createRoute({
	method: "get",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGEST_TEMPLATES.BASE("{campaignId}")
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

export const routeGetSessionDigestTemplate = createRoute({
	method: "get",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGEST_TEMPLATES.DETAILS(
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

export const routeUpdateSessionDigestTemplate = createRoute({
	method: "put",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGEST_TEMPLATES.DETAILS(
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

export const routeDeleteSessionDigestTemplate = createRoute({
	method: "delete",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGEST_TEMPLATES.DETAILS(
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
