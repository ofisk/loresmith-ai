import { Hono } from "hono";
import { UploadSessionDO } from "@/durable-objects/upload-session";
import { getCorsHeaders } from "@/lib/api/cors";
import { createLogger } from "@/lib/logger";
import {
	type ProcessingMessage,
	queue as queueFn,
	scheduled as scheduledFn,
} from "@/queue-consumer";
import { type Env, registerRoutes } from "@/routes/register-routes";
import { API_CONFIG } from "@/shared-config";
import type { RebuildQueueMessage } from "@/types/rebuild-queue";
import type { ShardEmbeddingQueueMessage } from "@/types/shard-embedding-queue";

export { Chat } from "@/durable-objects/chat";
export { NotificationHub } from "./durable-objects";
export { UploadSessionDO };

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
	const logger = createLogger(
		c.env as unknown as Record<string, unknown>,
		"[Server]"
	);
	const start = Date.now();
	const method = c.req.method;
	const path = c.req.path;

	if (method === "OPTIONS") {
		logger.trace(`${method} ${path} -> 204 (preflight)`);
		return new Response(null, {
			status: 204,
			headers: getCorsHeaders(c.req.raw, c.env),
		});
	}

	// Restrict usage to U.S. (e.g. Anthropic ToS). Exclude Stripe webhook (server-to-server).
	const country =
		c.req.header("CF-IPCountry") ??
		(c.req.raw as Request & { cf?: { country?: string } }).cf?.country ??
		"";
	if (
		country &&
		country !== "US" &&
		path !== API_CONFIG.apiRoute(API_CONFIG.ENDPOINTS.BILLING.WEBHOOK)
	) {
		for (const [key, value] of Object.entries(
			getCorsHeaders(c.req.raw, c.env)
		)) {
			c.header(key, value);
		}
		return c.json(
			{
				error: "Service is only available in the United States.",
			},
			403
		);
	}

	try {
		await next();
	} catch (error) {
		logger.error(`${method} ${path} - unhandled error`, error);
		throw error;
	}

	for (const [key, value] of Object.entries(getCorsHeaders(c.req.raw, c.env))) {
		c.header(key, value);
	}

	const status = c.res.status || 200;
	const durationMs = Date.now() - start;
	if (status >= 500) {
		logger.error(`${method} ${path} -> ${status} (${durationMs}ms)`);
	} else if (status >= 400) {
		logger.warn(`${method} ${path} -> ${status} (${durationMs}ms)`);
	} else {
		logger.debug(`${method} ${path} -> ${status} (${durationMs}ms)`);
	}
});

registerRoutes(app);

export default {
	fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
		return app.fetch(request, env, ctx);
	},
	queue: (
		batch: MessageBatch<
			ProcessingMessage | RebuildQueueMessage | ShardEmbeddingQueueMessage
		>,
		env: Env,
		_ctx: ExecutionContext
	) => {
		return queueFn(batch, env);
	},
	scheduled: (event: ScheduledController, env: Env, _ctx: ExecutionContext) => {
		return scheduledFn(event, env);
	},
};
