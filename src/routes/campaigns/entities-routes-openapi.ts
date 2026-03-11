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

const CampaignIdEntityIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		entityId: z.string().openapi({ param: { name: "entityId", in: "path" } }),
	})
	.openapi("CampaignIdEntityIdParams");

const CampaignIdEntityIdRelationshipIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		entityId: z.string().openapi({ param: { name: "entityId", in: "path" } }),
		relationshipId: z
			.string()
			.openapi({ param: { name: "relationshipId", in: "path" } }),
	})
	.openapi("CampaignIdEntityIdRelationshipIdParams");

const CampaignIdEntryIdParams = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
		entryId: z.string().openapi({ param: { name: "entryId", in: "path" } }),
	})
	.openapi("CampaignIdEntryIdParams");

export const routeListEntities = createRoute({
	method: "get",
	path: toApiRoutePath("/campaigns/{campaignId}/entities"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Entity list" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeGetEntity = createRoute({
	method: "get",
	path: toApiRoutePath("/campaigns/{campaignId}/entities/{entityId}"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdEntityIdParams },
	responses: {
		200: { description: "Entity details" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeGetEntityRelationships = createRoute({
	method: "get",
	path: toApiRoutePath(
		"/campaigns/{campaignId}/entities/{entityId}/relationships"
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdEntityIdParams },
	responses: {
		200: { description: "Entity relationships" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeGetEntityNeighbors = createRoute({
	method: "get",
	path: toApiRoutePath(
		"/campaigns/{campaignId}/entities/{entityId}/graph/neighbors"
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdEntityIdParams },
	responses: {
		200: { description: "Entity graph neighbors" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeListRelationshipTypes = createRoute({
	method: "get",
	path: toApiRoutePath("/campaigns/{campaignId}/entities/relationship-types"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Relationship types" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeUpdateEntityImportance = createRoute({
	method: "patch",
	path: toApiRoutePath(
		"/campaigns/{campaignId}/entities/{entityId}/importance"
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdEntityIdParams,
		body: {
			content: {
				"application/json": { schema: z.any() },
			},
		},
	},
	responses: {
		200: { description: "Entity importance updated" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeGetEntityImportance = createRoute({
	method: "get",
	path: toApiRoutePath(
		"/campaigns/{campaignId}/entities/{entityId}/importance"
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdEntityIdParams },
	responses: {
		200: { description: "Entity importance" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeListTopEntitiesByImportance = createRoute({
	method: "get",
	path: toApiRoutePath("/campaigns/{campaignId}/entities/importance/top"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Top entities by importance" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeCreateEntityRelationship = createRoute({
	method: "post",
	path: toApiRoutePath(
		"/campaigns/{campaignId}/entities/{entityId}/relationships"
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		params: CampaignIdEntityIdParams,
		body: {
			content: { "application/json": { schema: z.any() } },
		},
	},
	responses: {
		200: { description: "Relationship created" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeDeleteEntityRelationship = createRoute({
	method: "delete",
	path: toApiRoutePath(
		"/campaigns/{campaignId}/entities/{entityId}/relationships/{relationshipId}"
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdEntityIdRelationshipIdParams },
	responses: {
		200: { description: "Relationship deleted" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeTriggerEntityExtraction = createRoute({
	method: "post",
	path: toApiRoutePath("/campaigns/{campaignId}/entities/extract"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Entity extraction triggered" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeTriggerEntityDeduplication = createRoute({
	method: "post",
	path: toApiRoutePath("/campaigns/{campaignId}/entities/deduplicate"),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Entity deduplication triggered" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeListPendingDeduplication = createRoute({
	method: "get",
	path: toApiRoutePath(
		"/campaigns/{campaignId}/entities/deduplication-pending"
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdParamSchema },
	responses: {
		200: { description: "Pending deduplication list" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeResolveDeduplicationEntry = createRoute({
	method: "post",
	path: toApiRoutePath(
		"/campaigns/{campaignId}/entities/deduplication-pending/{entryId}"
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: CampaignIdEntryIdParams },
	responses: {
		200: { description: "Deduplication entry resolved" },
		...Error401,
		...Error403,
		...Error404,
		...Error500,
	},
});

export const routeTestEntityExtractionFromR2 = createRoute({
	method: "post",
	path: toApiRoutePath(
		API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.TEST_EXTRACT_FROM_R2
	),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: {
		200: { description: "Test extraction complete" },
		...Error401,
		...Error500,
	},
});
