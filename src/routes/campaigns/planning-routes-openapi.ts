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

const CampaignIdTaskIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		taskId: z.string().openapi({ param: { name: "taskId", in: "path" } }),
	})
	.openapi("CampaignIdTaskIdParams");

export const routeGetPlanningTasks = createRoute({
	method: "get",
	path: toApiRoutePath("/campaigns/{campaignId}/planning-tasks"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Planning tasks" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeCreatePlanningTask = createRoute({
	method: "post",
	path: toApiRoutePath("/campaigns/{campaignId}/planning-tasks"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdParamSchema,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		200: { description: "Planning task created" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeUpdatePlanningTask = createRoute({
	method: "patch",
	path: toApiRoutePath("/campaigns/{campaignId}/planning-tasks/{taskId}"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdTaskIdParams,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		200: { description: "Planning task updated" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeDeletePlanningTask = createRoute({
	method: "delete",
	path: toApiRoutePath("/campaigns/{campaignId}/planning-tasks/{taskId}"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdTaskIdParams },
	responses: {
		200: { description: "Planning task deleted" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeBulkCompletePlanningTasks = createRoute({
	method: "post",
	path: toApiRoutePath("/campaigns/{campaignId}/planning-tasks/complete-bulk"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdParamSchema,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		200: { description: "Planning tasks completed" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeSearchPlanningContext = createRoute({
	method: "post",
	path: toApiRoutePath("/campaigns/{campaignId}/planning-context/search"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdParamSchema,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		200: { description: "Planning context search results" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeGetRecentPlanningContext = createRoute({
	method: "get",
	path: toApiRoutePath("/campaigns/{campaignId}/planning-context/recent"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Recent planning context" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeAssembleContext = createRoute({
	method: "post",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.CONTEXT_ASSEMBLY("{campaignId}")
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
		200: { description: "Context assembled" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});
