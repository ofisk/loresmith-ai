import { getDAOFactory } from "@/dao/dao-factory";
import type { ContextWithAuth } from "@/lib/route-utils";
import { getUserAuth } from "@/lib/route-utils";

const DEFAULT_CHAT_HISTORY_LIMIT = 50;
const MAX_CHAT_HISTORY_LIMIT = 500;

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
	const parsedLimit = Number.parseInt(
		c.req.query("limit") ?? String(DEFAULT_CHAT_HISTORY_LIMIT),
		10
	);
	const parsedOffset = Number.parseInt(c.req.query("offset") ?? "0", 10);
	const limit = Number.isFinite(parsedLimit)
		? Math.min(Math.max(parsedLimit, 1), MAX_CHAT_HISTORY_LIMIT)
		: DEFAULT_CHAT_HISTORY_LIMIT;
	const offset =
		Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

	try {
		const daoFactory = getDAOFactory(c.env);
		const messages = await daoFactory.messageHistoryDAO.getMessages({
			sessionId,
			username: auth.username,
			limit,
			offset,
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

		return c.json({
			messages: mapped,
			pagination: {
				limit,
				offset,
				returned: mapped.length,
				hasMore: mapped.length === limit,
				nextOffset: offset + mapped.length,
			},
		});
	} catch (_error) {
		return c.json({ error: "Failed to load chat history" }, 500);
	}
}
