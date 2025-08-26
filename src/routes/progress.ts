import type { Context } from "hono";
import type { Env } from "../middleware/auth";
import { subscribeToProgress } from "../services/progress-service";

// WebSocket endpoint for progress updates
export async function handleProgressWebSocket(c: Context<{ Bindings: Env }>) {
  const upgradeHeader = c.req.header("Upgrade");
  if (upgradeHeader !== "websocket") {
    return c.json({ error: "WebSocket upgrade required" }, 400);
  }

  const { 0: client, 1: server } = new WebSocketPair();

  server.accept();

  server.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data as string);
      if (data.type === "subscribe" && data.fileKey) {
        subscribeToProgress(data.fileKey, server);
      }
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  });

  server.addEventListener("close", () => {
    // Clean up subscriptions when WebSocket closes
    // The progress service handles cleanup internally
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}
