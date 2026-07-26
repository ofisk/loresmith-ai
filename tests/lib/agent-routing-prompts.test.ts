import { describe, expect, it } from "vitest";
import {
	formatAgentRoutingPrompt,
	formatAgentRoutingPromptParts,
} from "../../src/lib/prompts/agent-routing-prompts";

describe("agent routing prompts", () => {
	it("includes rules-reference routing guidance and examples", () => {
		const prompt = formatAgentRoutingPrompt(
			"- rules-reference: Rules lookup agent",
			"How does grappling work in 5e?",
			undefined
		);

		expect(prompt).toContain(`→ "rules-reference"`);
		expect(prompt).toContain(
			`"How does grappling work in 5e?" → rules-reference|95|Rules lookup`
		);
	});

	it("includes encounter-builder routing guidance and examples", () => {
		const prompt = formatAgentRoutingPrompt(
			"- encounter-builder: Encounter generation agent",
			"Build a medium-difficulty encounter for a level 7 party near Ashfen Marsh",
			undefined
		);

		expect(prompt).toContain(`→ "encounter-builder"`);
		expect(prompt).toContain(
			`"Build a medium-difficulty encounter for a level 7 party near Ashfen Marsh" → encounter-builder|95|Encounter generation`
		);
	});
});

describe("agent routing prompt parts", () => {
	it("keeps the prefix byte-identical across requests", () => {
		const first = formatAgentRoutingPromptParts(
			"- recap: Recap agent",
			"what happened last session?",
			"earlier turns"
		);
		const second = formatAgentRoutingPromptParts(
			"- recap: Recap agent",
			"a completely different message",
			undefined
		);

		expect(second.cacheablePrefix).toBe(first.cacheablePrefix);
	});

	it("keeps per-request content out of the cacheable prefix", () => {
		const { cacheablePrefix, variableSuffix } = formatAgentRoutingPromptParts(
			"- recap: Recap agent",
			"UNIQUE_USER_MESSAGE",
			"UNIQUE_RECENT_CONTEXT"
		);

		expect(cacheablePrefix).not.toContain("UNIQUE_USER_MESSAGE");
		expect(cacheablePrefix).not.toContain("UNIQUE_RECENT_CONTEXT");
		expect(variableSuffix).toContain("UNIQUE_USER_MESSAGE");
		expect(variableSuffix).toContain("UNIQUE_RECENT_CONTEXT");
	});

	it("carries the agent descriptions and static rules in the prefix", () => {
		const { cacheablePrefix } = formatAgentRoutingPromptParts(
			"- recap: Recap agent",
			"hello",
			undefined
		);

		expect(cacheablePrefix).toContain("- recap: Recap agent");
		expect(cacheablePrefix).toContain("Routing rules:");
		expect(cacheablePrefix).toContain("Examples:");
	});

	it("omits the recent-context line when there is no context", () => {
		const { variableSuffix } = formatAgentRoutingPromptParts(
			"- recap: Recap agent",
			"hello",
			undefined
		);

		expect(variableSuffix).not.toContain("Recent context");
	});
});
