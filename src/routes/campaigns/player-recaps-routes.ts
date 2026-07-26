import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import { ENDPOINTS } from "@/routes/endpoints";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import {
	handleGeneratePlayerRecap,
	handleGetPlayerRecap,
	handleGetRecapRecipients,
	handleGetRecapSettings,
	handleListPlayerRecaps,
	handleRecapUnsubscribe,
	handleRetryPlayerRecap,
	handleSendPlayerRecap,
	handleUpdatePlayerRecap,
	handleUpdateRecapSettings,
} from "@/routes/player-recaps";
import { CampaignIdParamSchema, ErrorSchema } from "@/routes/schemas/common";

const Error400 = {
	400: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Bad request",
	},
} as const;
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
const Error409 = {
	409: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Conflict (recaps disabled, already sent, or not editable)",
	},
} as const;
const Error422 = {
	422: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Nothing player-safe to send, or no eligible recipients",
	},
} as const;
const Error500 = {
	500: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Internal server error",
	},
} as const;

const CampaignIdRecapIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		recapId: z.string().openapi({ param: { name: "recapId", in: "path" } }),
	})
	.openapi("CampaignIdRecapIdParams");

const CampaignIdDigestIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		digestId: z.string().openapi({ param: { name: "digestId", in: "path" } }),
	})
	.openapi("CampaignIdDigestIdParams");

const UnsubscribeTokenParams = z
	.object({
		token: z.string().openapi({ param: { name: "token", in: "path" } }),
	})
	.openapi("RecapUnsubscribeTokenParams");

const routeGetRecapSettings = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.PLAYER_RECAPS.SETTINGS("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Recap settings for the campaign" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeUpdateRecapSettings = createRoute({
	method: "put",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.PLAYER_RECAPS.SETTINGS("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdParamSchema,
		body: { content: { "application/json": { schema: z.any() } } },
	},
	responses: {
		200: { description: "Recap settings updated" },
		...Error400,
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetRecapRecipients = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.PLAYER_RECAPS.RECIPIENTS("{campaignId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Players who would receive a recap, and exclusions" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeListPlayerRecaps = createRoute({
	method: "get",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.PLAYER_RECAPS.BASE("{campaignId}")),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Recap drafts and sends for the campaign" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGeneratePlayerRecap = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.PLAYER_RECAPS.GENERATE("{campaignId}", "{digestId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdDigestIdParams,
		body: {
			required: false,
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		201: { description: "Draft recap generated for review" },
		...Error401,
		...Error403,
		...Error404,
		...Error409,
		...Error422,
		...Error500,
	},
});

const routeGetPlayerRecap = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.PLAYER_RECAPS.DETAILS("{campaignId}", "{recapId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdRecapIdParams },
	responses: {
		200: { description: "Recap with source extract and delivery log" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeUpdatePlayerRecap = createRoute({
	method: "put",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.PLAYER_RECAPS.DETAILS("{campaignId}", "{recapId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdRecapIdParams,
		body: { content: { "application/json": { schema: z.any() } } },
	},
	responses: {
		200: { description: "Draft updated" },
		...Error400,
		...Error401,
		...Error403,
		...Error404,
		...Error409,
		...Error500,
	},
});

const routeSendPlayerRecap = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.PLAYER_RECAPS.SEND("{campaignId}", "{recapId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdRecapIdParams },
	responses: {
		200: { description: "Recap sent; per-recipient results returned" },
		...Error401,
		...Error403,
		...Error404,
		...Error409,
		...Error422,
		...Error500,
	},
});

const routeRetryPlayerRecap = createRoute({
	method: "post",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.PLAYER_RECAPS.RETRY("{campaignId}", "{recapId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdRecapIdParams },
	responses: {
		200: { description: "Failed recap returned to draft" },
		...Error401,
		...Error403,
		...Error404,
		...Error409,
		...Error500,
	},
});

/**
 * Unsubscribe is unauthenticated and lives outside /api: it is opened straight
 * from an email client by a player who may have no LoreSmith session.
 * GET serves the visible link; POST serves `List-Unsubscribe-Post` one-click.
 */
const routeRecapUnsubscribeGet = createRoute({
	method: "get",
	path: ENDPOINTS.PLAYER_RECAP_UNSUBSCRIBE("{token}"),
	request: { params: UnsubscribeTokenParams },
	responses: {
		200: { description: "Unsubscribed" },
		404: { description: "Unknown token" },
		500: { description: "Internal server error" },
	},
});

const routeRecapUnsubscribePost = createRoute({
	method: "post",
	path: ENDPOINTS.PLAYER_RECAP_UNSUBSCRIBE("{token}"),
	request: { params: UnsubscribeTokenParams },
	responses: {
		200: { description: "Unsubscribed" },
		404: { description: "Unknown token" },
		500: { description: "Internal server error" },
	},
});

export function registerCampaignPlayerRecapRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(
		routeGetRecapSettings,
		handleGetRecapSettings as unknown as Handler
	);
	app.openapi(
		routeUpdateRecapSettings,
		handleUpdateRecapSettings as unknown as Handler
	);
	app.openapi(
		routeGetRecapRecipients,
		handleGetRecapRecipients as unknown as Handler
	);
	app.openapi(
		routeListPlayerRecaps,
		handleListPlayerRecaps as unknown as Handler
	);
	app.openapi(
		routeGeneratePlayerRecap,
		handleGeneratePlayerRecap as unknown as Handler
	);
	app.openapi(routeGetPlayerRecap, handleGetPlayerRecap as unknown as Handler);
	app.openapi(
		routeUpdatePlayerRecap,
		handleUpdatePlayerRecap as unknown as Handler
	);
	app.openapi(
		routeSendPlayerRecap,
		handleSendPlayerRecap as unknown as Handler
	);
	app.openapi(
		routeRetryPlayerRecap,
		handleRetryPlayerRecap as unknown as Handler
	);
	app.openapi(
		routeRecapUnsubscribeGet,
		handleRecapUnsubscribe as unknown as Handler
	);
	app.openapi(
		routeRecapUnsubscribePost,
		handleRecapUnsubscribe as unknown as Handler
	);
}
