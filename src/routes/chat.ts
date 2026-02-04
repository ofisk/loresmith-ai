import type { Context } from "hono";

interface Env {
  CHAT: DurableObjectNamespace;
  [key: string]: unknown;
}

/**
 * POST /api/chat
 * Sends messages to the Chat Durable Object and returns the streamed agent response.
 * Body: { id: string (session id), messages: Array, ... } (AI SDK useChat format).
 */
export async function handleChatSend(c: Context<{ Bindings: Env }>) {
  let body: { id?: string; messages?: unknown[]; [key: string]: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const sessionId = body.id ?? c.req.header("X-Session-ID") ?? "default";
  const messages = body.messages ?? [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: "Missing or empty messages" }, 400);
  }

  const authHeader = c.req.header("Authorization");
  const chatId = c.env.CHAT.idFromName(sessionId);
  const chat = c.env.CHAT.get(chatId);

  const origin = new URL(c.req.url).origin;
  const doRequest = new Request(`${origin}/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify({ messages }),
  });

  const response = await chat.fetch(doRequest);
  return response;
}
