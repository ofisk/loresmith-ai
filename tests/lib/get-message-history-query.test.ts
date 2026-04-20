import { describe, expect, it } from "vitest";
import {
	buildMessageHistoryDaoOptions,
	normalizeMessageHistoryScope,
} from "@/lib/get-message-history-query";

describe("normalizeMessageHistoryScope", () => {
	it("defaults omitted or unknown values to campaign", () => {
		expect(normalizeMessageHistoryScope(undefined)).toBe("campaign");
		expect(normalizeMessageHistoryScope("")).toBe("campaign");
		expect(normalizeMessageHistoryScope("invalid")).toBe("campaign");
	});

	it("accepts explicit scopes", () => {
		expect(normalizeMessageHistoryScope("campaign")).toBe("campaign");
		expect(normalizeMessageHistoryScope("account")).toBe("account");
		expect(normalizeMessageHistoryScope("current_session")).toBe(
			"current_session"
		);
	});
});

describe("buildMessageHistoryDaoOptions", () => {
	it("does not set campaignId when omitted (avoid campaign_id IS NULL)", () => {
		const q = buildMessageHistoryDaoOptions({
			username: "alice",
			limit: 10,
			offset: 0,
			sessionId: "sess-1",
		});
		expect(q.campaignId).toBeUndefined();
		expect(q.sessionId).toBe("sess-1");
	});

	it("sets campaignId when provided as non-empty string", () => {
		const q = buildMessageHistoryDaoOptions({
			username: "alice",
			campaignId: "camp-1",
			limit: 5,
			offset: 0,
		});
		expect(q.campaignId).toBe("camp-1");
	});
});
