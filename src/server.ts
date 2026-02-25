import { Hono } from "hono";
import { UploadSessionDO } from "@/durable-objects/upload-session";
import { createLogger } from "@/lib/logger";
import {
  queue as queueFn,
  scheduled as scheduledFn,
  type ProcessingMessage,
} from "@/queue-consumer";
import { registerRoutes, type Env } from "@/routes/register-routes";
import type { RebuildQueueMessage } from "@/types/rebuild-queue";

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
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Session-ID",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    await next();
  } catch (error) {
    logger.error(`${method} ${path} - unhandled error`, error);
    throw error;
  }

  c.header("Access-Control-Allow-Origin", "*");
  c.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Session-ID"
  );

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
    batch: MessageBatch<ProcessingMessage | RebuildQueueMessage>,
    env: Env,
    _ctx: ExecutionContext
  ) => {
    return queueFn(batch, env);
  },
  scheduled: (event: ScheduledController, env: Env, _ctx: ExecutionContext) => {
    return scheduledFn(event, env);
  },
};
