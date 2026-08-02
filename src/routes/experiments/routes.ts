import { createRoute, z } from "@hono/zod-openapi";
import { requireAdmin, requireUserJwt } from "@/routes/auth";
import { toApiRoutePath } from "@/routes/env";
import { ErrorSchema } from "@/routes/schemas/common";
import { API_CONFIG } from "@/shared-config";

const E401 = {
	401: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Unauthorized",
	},
} as const;
const E403 = {
	403: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Admin access required",
	},
} as const;
const E404 = {
	404: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Not found",
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

const ExperimentKeyParamSchema = z
	.object({
		key: z.string().openapi({ param: { name: "key", in: "path" } }),
	})
	.openapi("ExperimentKeyParam");

/**
 * `API_CONFIG.ENDPOINTS.ADMIN.EXPERIMENTS.*` builders take a concrete key; the
 * OpenAPI path needs Hono's `:key` placeholder, so the builder is called with
 * the literal placeholder rather than duplicating the path string.
 */
const adminExperimentPath = (
	build: (key: string) => string,
	placeholder = ":key"
) => toApiRoutePath(build(placeholder));

/** Any authenticated user: their own resolved variant map. */
export const routeGetAssignments = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.EXPERIMENTS.ASSIGNMENTS),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("Variant assignments"), ...E401, ...E500 },
});

export const routeListExperiments = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.ADMIN.EXPERIMENTS.LIST),
	middleware: [requireUserJwt, requireAdmin],
	security: [{ bearerAuth: [] }],
	responses: { 200: jsonDesc("Experiment list"), ...E401, ...E403, ...E500 },
});

export const routeCreateExperiment = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.ADMIN.EXPERIMENTS.CREATE),
	middleware: [requireUserJwt, requireAdmin],
	security: [{ bearerAuth: [] }],
	request: { body: { content: { "application/json": { schema: z.any() } } } },
	responses: {
		201: jsonDesc("Created"),
		400: jsonDesc("Invalid input"),
		409: jsonDesc("Already exists"),
		...E401,
		...E403,
		...E500,
	},
});

export const routeUpdateExperiment = createRoute({
	method: "patch",
	path: adminExperimentPath(API_CONFIG.ENDPOINTS.ADMIN.EXPERIMENTS.UPDATE),
	middleware: [requireUserJwt, requireAdmin],
	security: [{ bearerAuth: [] }],
	request: {
		params: ExperimentKeyParamSchema,
		body: { content: { "application/json": { schema: z.any() } } },
	},
	responses: {
		200: jsonDesc("Updated"),
		400: jsonDesc("Invalid input"),
		...E401,
		...E403,
		...E404,
		...E500,
	},
});

export const routeDeleteExperiment = createRoute({
	method: "delete",
	path: adminExperimentPath(API_CONFIG.ENDPOINTS.ADMIN.EXPERIMENTS.DELETE),
	middleware: [requireUserJwt, requireAdmin],
	security: [{ bearerAuth: [] }],
	request: { params: ExperimentKeyParamSchema },
	responses: {
		200: jsonDesc("Deleted"),
		...E401,
		...E403,
		...E404,
		...E500,
	},
});

export const routeGetExperimentResults = createRoute({
	method: "get",
	path: adminExperimentPath(API_CONFIG.ENDPOINTS.ADMIN.EXPERIMENTS.RESULTS),
	middleware: [requireUserJwt, requireAdmin],
	security: [{ bearerAuth: [] }],
	request: { params: ExperimentKeyParamSchema },
	responses: {
		200: jsonDesc("Per-arm results"),
		...E401,
		...E403,
		...E500,
	},
});
