import { describe, expect, it } from "vitest";
import {
	buildMessageHistoryDaoOptions,
	normalizeMessageHistoryScope,
} from "@/lib/get-message-history-query";

describe("normalizeMessageHistoryScope", () => {
	it("defaults unknown values to current_session", () => {
		expect(normalizeMessageHistoryScope(undefined)).toBe("current_session");
		expect(normalizeMessageHistoryScope("")).toBe("current_session");
		expect(normalizeMessageHistoryScope("invalid")).toBe("current_session");
	});

	it("accepts campaign and account", () => {
		expect(normalizeMessageHistoryScope("campaign")).toBe("campaign");
		expect(normalizeMessageHistoryScope("account")).toBe("account");
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
