import { createRoute, z } from "@hono/zod-openapi";
import { requireUserJwt } from "@/routes/auth";
import { ENDPOINTS } from "@/routes/endpoints";
import { toApiRoutePath } from "@/routes/env";
import { ErrorSchema } from "@/routes/schemas/common";

const E401 = {
	401: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Unauthorized",
	},
} as const;
const E403 = {
	403: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "Forbidden",
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

const BackfillBodySchema = z.object({
	dryRun: z.boolean().optional(),
	fileKeyFilter: z.string().optional(),
	usernameFilter: z.string().optional(),
	limit: z.number().int().positive().optional(),
	sendNotifications: z.boolean().optional(),
});

export const routePostLibraryEntityBackfill = createRoute({
	method: "post",
	path: toApiRoutePath(ENDPOINTS.ADMIN.LIBRARY_ENTITY_BACKFILL),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		body: {
			content: {
				"application/json": {
					schema: BackfillBodySchema,
				},
			},
		},
	},
	responses: {
		200: jsonDesc("Backfill result"),
		...E401,
		...E403,
		...E500,
	},
});
