import { Hono } from "hono";
import { UploadSessionDO } from "@/durable-objects/upload-session";
import { queue as queueFn, scheduled as scheduledFn } from "@/queue_consumer";
import { registerRoutes, type Env } from "@/routes/register-routes";

export { Chat } from "@/durable-objects/chat";
export { NotificationHub } from "./durable-objects";
export { UploadSessionDO };

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  console.log(`[Server] ${c.req.method} ${c.req.path} - request received`);

  if (c.req.method === "OPTIONS") {
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
  await next();
  c.header("Access-Control-Allow-Origin", "*");
  c.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Session-ID"
  );
});

registerRoutes(app);

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
    return app.fetch(request, env, ctx);
  },
  queue: (batch: MessageBatch<unknown>, env: Env, _ctx?: ExecutionContext) => {
    return queueFn(batch as any, env as any);
  },
  scheduled: (event: ScheduledEvent, env: Env, _ctx?: ExecutionContext) => {
    return scheduledFn(event as any, env as any);
  },
};
