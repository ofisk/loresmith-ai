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

const CampaignIdTokenParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		token: z.string().openapi({ param: { name: "token", in: "path" } }),
	})
	.openapi("CampaignIdTokenParams");

const CampaignIdUsernameParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		username: z.string().openapi({ param: { name: "username", in: "path" } }),
	})
	.openapi("CampaignIdUsernameParams");

const CampaignIdResourceProposalIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		id: z.string().openapi({ param: { name: "id", in: "path" } }),
	})
	.openapi("CampaignIdResourceProposalIdParams");

export const routeCreateShareLink = createRoute({
	method: "post",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.SHARE_LINKS("{campaignId}")
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
		200: { description: "Share link created" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeListShareLinks = createRoute({
	method: "get",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.SHARE_LINKS("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Share links list" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeRevokeShareLink = createRoute({
	method: "delete",
	path: toApiRoutePath("/campaigns/{campaignId}/share-links/{token}"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdTokenParams },
	responses: {
		200: { description: "Share link revoked" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeGetPlayerCharacterClaimOptions = createRoute({
	method: "get",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIM_OPTIONS(
			"{campaignId}"
		)
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Player character claim options" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeCreatePlayerCharacterClaim = createRoute({
	method: "post",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIM("{campaignId}")
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
		200: { description: "Player character claim created" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeListPlayerCharacterClaims = createRoute({
	method: "get",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIMS("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Player character claims" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeAssignPlayerCharacterClaim = createRoute({
	method: "put",
	path: toApiRoutePath(
		"/campaigns/{campaignId}/player-character-claims/{username}"
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdUsernameParams,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		200: { description: "Player character claim assigned" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeClearPlayerCharacterClaim = createRoute({
	method: "delete",
	path: toApiRoutePath(
		"/campaigns/{campaignId}/player-character-claims/{username}"
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdUsernameParams },
	responses: {
		200: { description: "Player character claim cleared" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeCreateResourceProposal = createRoute({
	method: "post",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSALS("{campaignId}")
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
		200: { description: "Resource proposal created" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeListResourceProposals = createRoute({
	method: "get",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSALS("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Resource proposals list" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeApproveResourceProposal = createRoute({
	method: "post",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSAL_APPROVE(
			"{campaignId}",
			"{id}"
		)
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdResourceProposalIdParams },
	responses: {
		200: { description: "Resource proposal approved" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeRejectResourceProposal = createRoute({
	method: "post",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSAL_REJECT(
			"{campaignId}",
			"{id}"
		)
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdResourceProposalIdParams },
	responses: {
		200: { description: "Resource proposal rejected" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeDownloadFileFromProposal = createRoute({
	method: "get",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSAL_DOWNLOAD(
			"{campaignId}",
			"{id}"
		)
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdResourceProposalIdParams },
	responses: {
		200: { description: "File download" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});
