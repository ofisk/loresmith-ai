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
});
