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

export const routeGetUserState = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.ASSESSMENT.USER_STATE),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("User state"), ...E401, ...E500 },
});

export const routeGetAssessmentRecommendations = createRoute({
	method: "get",
	path: toApiRoutePath("/assessment/campaign-readiness/{campaignId}"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: { 200: jsonDesc("Campaign readiness"), ...E401, ...E500 },
});

export const routeGetUserActivity = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.ASSESSMENT.USER_ACTIVITY),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("User activity"), ...E401, ...E500 },
});

export const routeModuleIntegration = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.ASSESSMENT.MODULE_INTEGRATION),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { body: { content: { "application/json": { schema: z.any() } } } },
	responses: { 200: jsonDesc("Module integration"), ...E401, ...E500 },
});
