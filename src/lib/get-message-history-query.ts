import type { GetMessagesOptions } from "@/dao/message-history-dao";

export type MessageHistoryScope = "current_session" | "campaign" | "account";

/** Default is campaign-wide history (all sessions for that campaign). */
export function normalizeMessageHistoryScope(
	raw: string | undefined
): MessageHistoryScope {
	if (raw === "current_session") {
		return "current_session";
	}
	if (raw === "account") {
		return "account";
	}
	return "campaign";
}

/** Build DAO options; omit campaignId when unset so SQL does not add `campaign_id IS NULL`. */
export function buildMessageHistoryDaoOptions(params: {
	username: string;
	sessionId?: string;
	campaignId?: string | null;
	role?: "user" | "assistant" | "system";
	limit: number;
	offset: number;
	searchQuery?: string;
	beforeDate?: string;
	afterDate?: string;
}): GetMessagesOptions {
	const {
		username,
		sessionId,
		campaignId,
		role,
		limit,
		offset,
		searchQuery,
		beforeDate,
		afterDate,
	} = params;
	const opts: GetMessagesOptions = {
		username,
		limit,
		offset,
	};
	if (sessionId) {
		opts.sessionId = sessionId;
	}
	if (typeof campaignId === "string" && campaignId.length > 0) {
		opts.campaignId = campaignId;
	}
	if (role) {
		opts.role = role;
	}
	if (searchQuery) {
		opts.searchQuery = searchQuery;
	}
	if (beforeDate) {
		opts.beforeDate = beforeDate;
	}
	if (afterDate) {
		opts.afterDate = afterDate;
	}
	return opts;
}
