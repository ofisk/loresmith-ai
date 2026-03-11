import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { routeGetChatHistory } from "@/routes/chat/routes";
import { handleGetChatHistory } from "@/routes/chat-history";
import type { Env } from "@/routes/env";

export function registerChatRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(routeGetChatHistory, handleGetChatHistory as unknown as Handler);
}
