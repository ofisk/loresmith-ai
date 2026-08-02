import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import {
	handleDeleteAudio,
	handleGenerateAudio,
	handleGetAudio,
	handleGetAudioCapabilities,
	handleListAudio,
	handleStreamAudio,
	handleUpdateAudio,
} from "@/routes/campaign-audio";
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

const CampaignIdAudioIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		audioId: z.string().openapi({ param: { name: "audioId", in: "path" } }),
	})
	.openapi("CampaignIdAudioIdParams");

const routeGetAudioCapabilities = createRoute({
	method: "get",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.AUDIO.CAPABILITIES("{campaignId}")),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	description:
		"Report which audio kinds this deployment can generate. Ambience and music require an external provider because Workers AI has no sound or music model; voice and creature run on Workers AI text-to-speech. GM roles only.",
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Audio capabilities" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGenerateAudio = createRoute({
	method: "post",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.AUDIO.BASE("{campaignId}")),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	description:
		"Start generating a campaign audio track from campaign context. Answers 202 with a pending record; completion arrives as a notification. Requires edit access.",
	request: {
		params: CampaignIdParamSchema,
		body: { content: { "application/json": { schema: z.any() } } },
	},
	responses: {
		202: { description: "Generation started" },
		400: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Invalid request",
		},
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeListAudio = createRoute({
	method: "get",
	path: toApiRoutePath(ENDPOINTS.CAMPAIGNS.AUDIO.BASE("{campaignId}")),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	description:
		"List generated audio tracks for a campaign, optionally filtered by kind or source. GM roles only.",
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Audio track list" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeGetAudio = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.AUDIO.DETAILS("{campaignId}", "{audioId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	description: "Get one audio track's metadata. GM roles only.",
	request: { params: CampaignIdAudioIdParams },
	responses: {
		200: { description: "Audio track" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeStreamAudio = createRoute({
	method: "get",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.AUDIO.STREAM("{campaignId}", "{audioId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	description:
		"Stream the audio bytes for playback. Served through the Worker so playback carries campaign authorization; R2 is never exposed publicly. GM roles only.",
	request: { params: CampaignIdAudioIdParams },
	responses: {
		200: {
			content: { "audio/mpeg": { schema: z.any() } },
			description: "Audio bytes",
		},
		409: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Track is still generating or failed",
		},
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeUpdateAudio = createRoute({
	method: "patch",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.AUDIO.DETAILS("{campaignId}", "{audioId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	description:
		"Rename a track, edit its description, or toggle looping. Requires edit access.",
	request: {
		params: CampaignIdAudioIdParams,
		body: { content: { "application/json": { schema: z.any() } } },
	},
	responses: {
		200: { description: "Audio updated" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

const routeDeleteAudio = createRoute({
	method: "delete",
	path: toApiRoutePath(
		ENDPOINTS.CAMPAIGNS.AUDIO.DETAILS("{campaignId}", "{audioId}")
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	description:
		"Delete a track and its stored audio file. Requires edit access.",
	request: { params: CampaignIdAudioIdParams },
	responses: {
		200: { description: "Audio deleted" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export function registerCampaignAudioRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	// Registered before the :audioId routes so "capabilities" is not swallowed.
	app.openapi(
		routeGetAudioCapabilities,
		handleGetAudioCapabilities as unknown as Handler
	);
	app.openapi(routeGenerateAudio, handleGenerateAudio as unknown as Handler);
	app.openapi(routeListAudio, handleListAudio as unknown as Handler);
	app.openapi(routeStreamAudio, handleStreamAudio as unknown as Handler);
	app.openapi(routeGetAudio, handleGetAudio as unknown as Handler);
	app.openapi(routeUpdateAudio, handleUpdateAudio as unknown as Handler);
	app.openapi(routeDeleteAudio, handleDeleteAudio as unknown as Handler);
}
