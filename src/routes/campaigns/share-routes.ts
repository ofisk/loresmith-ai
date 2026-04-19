import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import {
	handleApproveResourceProposal,
	handleCreateResourceProposal,
	handleDownloadFileFromProposal,
	handleListResourceProposals,
	handleRejectResourceProposal,
} from "@/routes/campaign-resource-proposals";
import {
	handleApprovePlayerCharacterClaim,
	handleAssignPlayerCharacterClaim,
	handleClearPlayerCharacterClaim,
	handleCreatePlayerCharacterClaim,
	handleCreateShareLink,
	handleGetPlayerCharacterClaimOptions,
	handleGetPlayerCharacterRoster,
	handleListPlayerCharacterClaims,
	handleListShareLinks,
	handleRevokeShareLink,
} from "@/routes/campaign-share";
import { ENDPOINTS } from "@/routes/endpoints";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import { CampaignIdParamSchema, ErrorSchema } from "@/routes/schemas/common";

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

const routeCreateShareLink = createRoute({
	method: "post",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.SHARE_LINKS("{campaignId}")),
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

const routeListShareLinks = createRoute({
	method: "get",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.SHARE_LINKS("{campaignId}")),
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

const routeRevokeShareLink = createRoute({
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

const routeGetPlayerCharacterClaimOptions = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIM_OPTIONS("{campaignId}")
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

const routeCreatePlayerCharacterClaim = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIM("{campaignId}")
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

const routeListPlayerCharacterClaims = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIMS("{campaignId}")
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

const routeGetPlayerCharacterRoster = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_ROSTER("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Player character roster (all campaign members)" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeAssignPlayerCharacterClaim = createRoute({
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

const routeClearPlayerCharacterClaim = createRoute({
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

const routeApprovePlayerCharacterClaim = createRoute({
	method: "post",
	path: toApiRoutePath(
		"/campaigns/{campaignId}/player-character-claims/{username}/approve"
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdUsernameParams },
	responses: {
		200: { description: "Player character claim approved" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeCreateResourceProposal = createRoute({
	method: "post",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSALS("{campaignId}")),
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

const routeListResourceProposals = createRoute({
	method: "get",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSALS("{campaignId}")),
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

const routeApproveResourceProposal = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSAL_APPROVE("{campaignId}", "{id}")
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

const routeRejectResourceProposal = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSAL_REJECT("{campaignId}", "{id}")
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

const routeDownloadFileFromProposal = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSAL_DOWNLOAD("{campaignId}", "{id}")
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

export function registerCampaignShareRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(
		routeCreateShareLink,
		handleCreateShareLink as unknown as Handler
	);
	app.openapi(routeListShareLinks, handleListShareLinks as unknown as Handler);
	app.openapi(
		routeRevokeShareLink,
		handleRevokeShareLink as unknown as Handler
	);
	app.openapi(
		routeGetPlayerCharacterClaimOptions,
		handleGetPlayerCharacterClaimOptions as unknown as Handler
	);
	app.openapi(
		routeCreatePlayerCharacterClaim,
		handleCreatePlayerCharacterClaim as unknown as Handler
	);
	app.openapi(
		routeListPlayerCharacterClaims,
		handleListPlayerCharacterClaims as unknown as Handler
	);
	app.openapi(
		routeGetPlayerCharacterRoster,
		handleGetPlayerCharacterRoster as unknown as Handler
	);
	app.openapi(
		routeAssignPlayerCharacterClaim,
		handleAssignPlayerCharacterClaim as unknown as Handler
	);
	app.openapi(
		routeClearPlayerCharacterClaim,
		handleClearPlayerCharacterClaim as unknown as Handler
	);
	app.openapi(
		routeApprovePlayerCharacterClaim,
		handleApprovePlayerCharacterClaim as unknown as Handler
	);
	app.openapi(
		routeCreateResourceProposal,
		handleCreateResourceProposal as unknown as Handler
	);
	app.openapi(
		routeListResourceProposals,
		handleListResourceProposals as unknown as Handler
	);
	app.openapi(
		routeApproveResourceProposal,
		handleApproveResourceProposal as unknown as Handler
	);
	app.openapi(
		routeRejectResourceProposal,
		handleRejectResourceProposal as unknown as Handler
	);
	app.openapi(
		routeDownloadFileFromProposal,
		handleDownloadFileFromProposal as unknown as Handler
	);
}
