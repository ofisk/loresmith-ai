import { createRoute, z } from "@hono/zod-openapi";
import { requireUserJwt } from "@/routes/auth";
import { toApiRoutePath } from "@/routes/env";
import { ErrorSchema } from "@/routes/schemas/common";
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

/**
 * Filters shared by the list and its summary. Declared once so the two can
 * never accept different windows and report inconsistent numbers.
 */
const ActivityQuerySchema = z
	.object({
		campaignId: z.string().optional(),
		sessionId: z.string().optional(),
		agentType: z.string().optional(),
		status: z.string().optional(),
		since: z.string().optional(),
		limit: z.string().optional(),
		offset: z.string().optional(),
	})
	.openapi("AgentActivityQuery");

export const routeListAgentActivity = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.AGENT_ACTIVITY.LIST),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { query: ActivityQuerySchema },
	responses: { 200: jsonDesc("Agent activity"), ...E401, ...E500 },
});

export const routeGetAgentActivitySummary = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.AGENT_ACTIVITY.SUMMARY),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { query: ActivityQuerySchema },
	responses: { 200: jsonDesc("Agent activity counts"), ...E401, ...E500 },
});

export const routeGetAgentActivityTree = createRoute({
	method: "get",
	// The builder takes a concrete id; the OpenAPI path needs Hono's placeholder,
	// so it is called with the placeholder rather than duplicating the string.
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.AGENT_ACTIVITY.TREE(":rootId")),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: {
		200: jsonDesc("Activity tree"),
		400: jsonDesc("Missing rootId"),
		404: jsonDesc("Not found"),
		...E401,
		...E500,
	},
});
