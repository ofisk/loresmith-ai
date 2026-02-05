import { getDAOFactory } from "@/dao/dao-factory";
import type { ContextWithAuth } from "@/lib/route-utils";
import { getUserAuth } from "@/lib/route-utils";

const CHAT_HISTORY_LIMIT = 500;

/**
 * GET /chat-history/:sessionId
 * Returns persisted chat messages for the given session for the authenticated user.
 * Used to restore chat history on page load.
 *
 * SECURITY: This route always filters by BOTH sessionId and username so users
 * can only see their own messages for a given chat session. There are no
 * cross-user or global fallbacks here.
 */
export async function handleGetChatHistory(
  c: ContextWithAuth
): Promise<Response> {
  const auth = getUserAuth(c);
  const sessionId = c.req.param("sessionId");
  if (!sessionId) {
    return c.json({ error: "Session ID required" }, 400);
  }

  try {
    const daoFactory = getDAOFactory(c.env);
    const messages = await daoFactory.messageHistoryDAO.getMessages({
      sessionId,
      username: auth.username,
      limit: CHAT_HISTORY_LIMIT,
      offset: 0,
    });

    const mapped = messages.map((msg) => {
      let data: Record<string, unknown> | undefined;
      if (msg.messageData) {
        try {
          data = JSON.parse(msg.messageData) as Record<string, unknown>;
        } catch {
          // ignore parse errors
        }
      }
      const content = msg.content ?? "";
      return {
        id: msg.id,
        role: msg.role,
        content,
        parts: content ? [{ type: "text" as const, text: content }] : [],
        ...(data != null && { data }),
        createdAt: msg.createdAt,
      };
    });

    console.log("[ChatHistory] Returning messages", {
      sessionId,
      username: auth.username,
      count: mapped.length,
    });

    return c.json({ messages: mapped });
  } catch (error) {
    console.error("[ChatHistory] Failed to fetch history:", error);
    return c.json({ error: "Failed to load chat history" }, 500);
  }
}
