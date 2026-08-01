import { describe, expect, it } from "vitest";
import {
	dropEmptyContentMessages,
	hasSendableContent,
} from "@/lib/chat-message-sanitization";

/**
 * Anthropic rejects a request outright when any message flattens to an empty
 * text block, and the client replays the whole conversation every turn — so one
 * empty message stops a conversation responding permanently, not just once.
 */
describe("chat message sanitization", () => {
	describe("hasSendableContent", () => {
		it("keeps messages with real text", () => {
			expect(
				hasSendableContent({ role: "user", content: "what's Grik's voice?" })
			).toBe(true);
		});

		it("rejects empty string content", () => {
			expect(hasSendableContent({ role: "assistant", content: "" })).toBe(
				false
			);
		});

		it("rejects whitespace-only content, which the provider trims to empty", () => {
			expect(hasSendableContent({ role: "assistant", content: "  \n\t" })).toBe(
				false
			);
		});

		it("rejects missing content", () => {
			expect(hasSendableContent({ role: "assistant" })).toBe(false);
		});

		it("passes through non-string content untouched", () => {
			expect(
				hasSendableContent({
					role: "assistant",
					content: [{ type: "text", text: "hi" }],
				})
			).toBe(true);
		});
	});

	describe("dropEmptyContentMessages", () => {
		it("removes the tool-call-only assistant turn that poisons the thread", () => {
			const messages = [
				{ role: "user", content: "list my NPCs" },
				{ role: "assistant", content: "" },
				{ role: "user", content: "what's Grik's voice sound like?" },
			];

			expect(dropEmptyContentMessages(messages)).toEqual([
				{ role: "user", content: "list my NPCs" },
				{ role: "user", content: "what's Grik's voice sound like?" },
			]);
		});

		it("leaves a clean history untouched", () => {
			const messages = [
				{ role: "user", content: "hi" },
				{ role: "assistant", content: "hello" },
			];

			expect(dropEmptyContentMessages(messages)).toEqual(messages);
		});

		it("preserves message properties beyond role and content", () => {
			const messages = [
				{ role: "user", content: "hi", data: { jwt: "token" } },
				{ role: "assistant", content: "" },
			];

			expect(dropEmptyContentMessages(messages)).toEqual([
				{ role: "user", content: "hi", data: { jwt: "token" } },
			]);
		});

		it("returns an empty list when every message is empty", () => {
			expect(
				dropEmptyContentMessages([
					{ role: "assistant", content: "" },
					{ role: "assistant", content: " " },
				])
			).toEqual([]);
		});
	});
});
