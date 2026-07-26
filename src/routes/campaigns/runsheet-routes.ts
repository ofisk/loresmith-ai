import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import { ENDPOINTS } from "@/routes/endpoints";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import {
	handleDeleteRunsheet,
	handleExportRunsheetHtml,
	handleGenerateRunsheet,
	handleGetRunsheet,
	handleListRunsheets,
	handleUpdateRunsheet,
} from "@/routes/runsheets";
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

const CampaignIdRunsheetIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		runsheetId: z
			.string()
			.openapi({ param: { name: "runsheetId", in: "path" } }),
	})
	.openapi("CampaignIdRunsheetIdParams");

const routeGenerateRunsheet = createRoute({
	method: "post",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.RUNSHEETS.BASE("{campaignId}")),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	description:
		"Generate a GM-only session runsheet snapshot assembled from existing campaign data. Requires edit access; never available to player roles.",
	request: {
		params: CampaignIdParamSchema,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		201: { description: "Runsheet generated" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeListRunsheets = createRoute({
	method: "get",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.RUNSHEETS.BASE("{campaignId}")),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	description: "List runsheet snapshots for a campaign. GM roles only.",
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Runsheet list" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetRunsheet = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.RUNSHEETS.DETAILS("{campaignId}", "{runsheetId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	description:
		"Get a runsheet snapshot, including its full body. GM roles only.",
	request: { params: CampaignIdRunsheetIdParams },
	responses: {
		200: { description: "Runsheet details" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeUpdateRunsheet = createRoute({
	method: "put",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.RUNSHEETS.DETAILS("{campaignId}", "{runsheetId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	description:
		"Persist hand-edits to a runsheet snapshot. Requires edit access.",
	request: {
		params: CampaignIdRunsheetIdParams,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		200: { description: "Runsheet updated" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeDeleteRunsheet = createRoute({
	method: "delete",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.RUNSHEETS.DETAILS("{campaignId}", "{runsheetId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	description: "Delete a runsheet snapshot. Requires edit access.",
	request: { params: CampaignIdRunsheetIdParams },
	responses: {
		200: { description: "Runsheet deleted" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeExportRunsheetHtml = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.RUNSHEETS.EXPORT_HTML("{campaignId}", "{runsheetId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	description:
		"Export a runsheet as a standalone print-friendly HTML document. Print to PDF from the browser. GM roles only.",
	request: { params: CampaignIdRunsheetIdParams },
	responses: {
		200: {
			content: { "text/html": { schema: z.string() } },
			description: "Print-friendly runsheet document",
		},
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export function registerCampaignRunsheetRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(
		routeGenerateRunsheet,
		handleGenerateRunsheet as unknown as Handler
	);
	app.openapi(routeListRunsheets, handleListRunsheets as unknown as Handler);
	// Registered before the :runsheetId route so "export.html" is not swallowed.
	app.openapi(
		routeExportRunsheetHtml,
		handleExportRunsheetHtml as unknown as Handler
	);
	app.openapi(routeGetRunsheet, handleGetRunsheet as unknown as Handler);
	app.openapi(routeUpdateRunsheet, handleUpdateRunsheet as unknown as Handler);
	app.openapi(routeDeleteRunsheet, handleDeleteRunsheet as unknown as Handler);
}
