import { describe, expect, it } from "vitest";
import { getCampaignIdFromConversationId } from "@/lib/conversation-id-utils";

describe("getCampaignIdFromConversationId", () => {
	it("returns null for null", () => {
		expect(getCampaignIdFromConversationId(null)).toBeNull();
	});

	it("returns null for undefined", () => {
		expect(getCampaignIdFromConversationId(undefined)).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(getCampaignIdFromConversationId("")).toBeNull();
	});

	it("returns null for non-string", () => {
		expect(
			getCampaignIdFromConversationId(123 as unknown as string)
		).toBeNull();
	});

	it("returns campaign id from conversation id format", () => {
		expect(getCampaignIdFromConversationId("user1-campaign-abc123")).toBe(
			"abc123"
		);
	});

	it("returns null when suffix not found", () => {
		expect(getCampaignIdFromConversationId("invalid-id")).toBeNull();
	});

	it("returns null for 'none' campaign", () => {
		expect(getCampaignIdFromConversationId("user1-campaign-none")).toBeNull();
	});

	it("uses last occurrence of suffix", () => {
		expect(
			getCampaignIdFromConversationId(
				"x-campaign-a-campaign-xyz-campaign-final"
			)
		).toBe("final");
	});
});
