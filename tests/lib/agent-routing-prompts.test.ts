import { describe, expect, it } from "vitest";
import { formatAgentRoutingPrompt } from "../../src/lib/prompts/agent-routing-prompts";

describe("agent routing prompts", () => {
	it("includes rules-reference routing guidance and examples", () => {
		const prompt = formatAgentRoutingPrompt(
			"- rules-reference: Rules lookup agent",
			"How does grappling work in 5e?",
			undefined,
			["rules-reference"]
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
			undefined,
			["encounter-builder"]
		);

		expect(prompt).toContain(`→ "encounter-builder"`);
		expect(prompt).toContain(
			`"Build a medium-difficulty encounter for a level 7 party near Ashfen Marsh" → encounter-builder|95|Encounter generation`
		);
	});
});
