import { createRoute } from "@hono/zod-openapi";
import { toApiRoutePath } from "@/routes/env";
import { ErrorSchema } from "@/routes/schemas/common";
import { API_CONFIG } from "@/shared-config";

const E400 = {
	400: {
		content: { "application/json": { schema: ErrorSchema } },
		description: "WebSocket upgrade required",
	},
} as const;

export const routeProgressWebSocket = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.PROGRESS.WEBSOCKET),
	responses: {
		101: { description: "WebSocket upgrade" },
		...E400,
	},
});
