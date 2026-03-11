import { createRoute, z } from "@hono/zod-openapi";
import { requireUserJwt } from "@/routes/auth";
import { toApiRoutePath } from "@/routes/env";
import { ErrorSchema } from "@/routes/schemas/common";
import { API_CONFIG } from "@/shared-config";

const SessionIdParamSchema = z.object({
	sessionId: z.string().openapi({ param: { name: "sessionId", in: "path" } }),
});

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

export const routeGetChatHistory = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.CHAT.HISTORY("{sessionId}")),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: { params: SessionIdParamSchema },
	responses: {
		200: {
			content: { "application/json": { schema: z.any() } },
			description: "Chat history",
		},
		...E401,
		...E500,
	},
});
