import { createRoute, z } from "@hono/zod-openapi";
import { requireUserJwt } from "@/routes/auth";
import { toApiRoutePath } from "@/routes/env";
import { CampaignIdParamSchema, ErrorSchema } from "@/routes/schemas/common";
import { API_CONFIG } from "@/shared-config";

const E401 = {
	401: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Unauthorized",
	},
} as const;
const E500 = {
	500: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Internal server error",
	},
} as const;
const jsonDesc = (d: string) => ({
	content: { "application/json": { schema: z.any() } } as const,
	description: d,
});

export const routeGetWelcomeGuidance = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.ONBOARDING.WELCOME_GUIDANCE),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("Welcome guidance"), ...E401, ...E500 },
});

export const routeGetNextActions = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.ONBOARDING.NEXT_ACTIONS),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("Next actions"), ...E401, ...E500 },
});

export const routeGetStateAnalysis = createRoute({
	method: "get",
	path: toApiRoutePath("/onboarding/campaign-guidance/{campaignId}"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: { 200: jsonDesc("Campaign guidance"), ...E401, ...E500 },
});
