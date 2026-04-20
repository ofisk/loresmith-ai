import { describe, expect, it } from "vitest";
import { messageHistoryInjectionFlags } from "@/lib/message-history-injection";

describe("messageHistoryInjectionFlags", () => {
	it("detects ambiguous follow-up references", () => {
		const r = messageHistoryInjectionFlags("Use the first one from the list");
		expect(r.ambiguousReference).toBe(true);
		expect(r.historyResearch).toBe(false);
	});

	it("detects explicit chat history research (last N days)", () => {
		const r = messageHistoryInjectionFlags(
			"Search back through the last 3 days of chat history and extract all conversations about pregens as real PCs"
		);
		expect(r.historyResearch).toBe(true);
	});

	it("detects extract ... conversations", () => {
		const r = messageHistoryInjectionFlags(
			"Extract all conversations about pregens as real PCs"
		);
		expect(r.historyResearch).toBe(true);
	});

	it("detects scroll through phrasing", () => {
		const r = messageHistoryInjectionFlags(
			"Scroll back through messages about the heist"
		);
		expect(r.historyResearch).toBe(true);
	});

	it("does not flag routine campaign questions", () => {
		const r = messageHistoryInjectionFlags(
			"Add Brother Anselm as a PC entity with cleric stats"
		);
		expect(r.ambiguousReference).toBe(false);
		expect(r.historyResearch).toBe(false);
	});
});
