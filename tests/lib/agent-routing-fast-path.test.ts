import { describe, expect, it } from "vitest";
import {
	CONTEXT_RECAP_PLACEHOLDER,
	UI_INITIATED_PROMPTS,
} from "../../src/app-constants";
import {
	matchAdvisoryRoute,
	matchDecisiveRoute,
	normalizeForMatching,
	resolveExplicitAgentHint,
} from "../../src/lib/agent-routing-fast-path";

const REGISTERED = [
	"campaign",
	"campaign-context",
	"recap",
	"campaign-analysis",
	"character",
	"character-sheets",
	"entity-graph",
	"onboarding",
	"resources",
	"session-digest",
	"loot-reward",
	"rules-reference",
	"encounter-builder",
];

describe("resolveExplicitAgentHint", () => {
	it("accepts a registered agent type", () => {
		expect(resolveExplicitAgentHint({ agentType: "recap" }, REGISTERED)).toBe(
			"recap"
		);
	});

	it("tolerates surrounding whitespace", () => {
		expect(
			resolveExplicitAgentHint({ agentType: " session-digest " }, REGISTERED)
		).toBe("session-digest");
	});

	it("ignores an unregistered agent type rather than routing to it", () => {
		expect(
			resolveExplicitAgentHint({ agentType: "not-an-agent" }, REGISTERED)
		).toBeNull();
	});

	it("ignores non-string and missing hints", () => {
		expect(resolveExplicitAgentHint({ agentType: 42 }, REGISTERED)).toBeNull();
		expect(resolveExplicitAgentHint({}, REGISTERED)).toBeNull();
		expect(resolveExplicitAgentHint(undefined, REGISTERED)).toBeNull();
		expect(resolveExplicitAgentHint("recap", REGISTERED)).toBeNull();
		expect(resolveExplicitAgentHint(null, REGISTERED)).toBeNull();
	});
});

describe("normalizeForMatching", () => {
	it("lowercases, collapses whitespace, and drops trailing punctuation", () => {
		expect(normalizeForMatching("  What   Should I Do   Next?  ")).toBe(
			"what should i do next"
		);
	});

	it("does not remove interior words", () => {
		expect(normalizeForMatching("what should I do next about rules")).toBe(
			"what should i do next about rules"
		);
	});
});

describe("matchDecisiveRoute", () => {
	it("routes the context recap sentinel to recap", () => {
		expect(matchDecisiveRoute(CONTEXT_RECAP_PLACEHOLDER)?.agent).toBe("recap");
	});

	it("routes each UI-initiated prompt to its known agent", () => {
		expect(matchDecisiveRoute(UI_INITIATED_PROMPTS.HELP)?.agent).toBe(
			"onboarding"
		);
		expect(matchDecisiveRoute(UI_INITIATED_PROMPTS.SESSION_RECAP)?.agent).toBe(
			"session-digest"
		);
		expect(matchDecisiveRoute(UI_INITIATED_PROMPTS.NEXT_STEPS_GM)?.agent).toBe(
			"recap"
		);
		expect(
			matchDecisiveRoute(UI_INITIATED_PROMPTS.NEXT_STEPS_PLAYER)?.agent
		).toBe("recap");
	});

	it("routes session plan readout phrases to recap", () => {
		for (const phrase of [
			"let's do a readout",
			"Construct the readout.",
			"give me the session plan",
			"I'm ready for the readout",
		]) {
			expect(matchDecisiveRoute(phrase)?.agent).toBe("recap");
		}
	});

	it("reports full confidence and a reason for a match", () => {
		const match = matchDecisiveRoute("what should I do next?");
		expect(match).toMatchObject({ agent: "recap", confidence: 100 });
		expect(match?.reason).toBeTruthy();
		expect(match?.rule).toContain("phrase:");
	});

	// The safety property: a decisive rule must never fire on a message whose
	// destination is genuinely ambiguous, so matching is whole-message only.
	it("does not match a known phrase embedded in a longer message", () => {
		expect(
			matchDecisiveRoute(
				"what should I do next about the grappling rules in 5e?"
			)
		).toBeNull();
		expect(
			matchDecisiveRoute("before we do a readout, what monsters are nearby?")
		).toBeNull();
	});

	it("returns null for ordinary messages and empty input", () => {
		expect(matchDecisiveRoute("who is Elara Moonwhisper?")).toBeNull();
		expect(matchDecisiveRoute("build me an encounter")).toBeNull();
		expect(matchDecisiveRoute("")).toBeNull();
		expect(matchDecisiveRoute("   ")).toBeNull();
	});
});

describe("matchAdvisoryRoute", () => {
	it("guesses rules-reference for rules questions", () => {
		expect(matchAdvisoryRoute("How does grappling work in 5e?")?.agent).toBe(
			"rules-reference"
		);
	});

	it("guesses encounter-builder for encounter requests", () => {
		expect(
			matchAdvisoryRoute(
				"Build an encounter for a level 7 party near Ashfen Marsh"
			)?.agent
		).toBe("encounter-builder");
	});

	it("guesses loot-reward for loot questions", () => {
		expect(
			matchAdvisoryRoute(
				"What should the players find after defeating the bandit captain?"
			)?.agent
		).toBe("loot-reward");
	});

	it("carries a rule id so disagreement can be attributed per rule", () => {
		expect(matchAdvisoryRoute("upload my character sheet")?.rule).toBe(
			"advisory:character-sheets"
		);
	});

	it("returns null when nothing matches", () => {
		expect(
			matchAdvisoryRoute("tell me about the weather in Neverwinter")
		).toBeNull();
		expect(matchAdvisoryRoute("")).toBeNull();
	});

	it("never reports full confidence, since it must not be routed on", () => {
		const match = matchAdvisoryRoute("How does grappling work in 5e?");
		expect(match?.confidence).toBeLessThan(100);
	});
});
