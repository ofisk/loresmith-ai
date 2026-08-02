import { describe, expect, it } from "vitest";
import { CampaignAgent } from "../../src/agents/campaign-agent";
import { CampaignAnalysisAgent } from "../../src/agents/campaign-analysis-agent";
import { CampaignContextAgent } from "../../src/agents/campaign-context-agent";
import { CampaignHelpAgent } from "../../src/agents/campaign-help-agent";
import { CharacterAgent } from "../../src/agents/character-agent";
import { CharacterSheetAgent } from "../../src/agents/character-sheet-agent";
import { EncounterBuilderAgent } from "../../src/agents/encounter-builder-agent";
import { EntityGraphAgent } from "../../src/agents/entity-graph-agent";
import { LootRewardAgent } from "../../src/agents/loot-reward-agent";
import { RecapAgent } from "../../src/agents/recap-agent";
import { ResourceAgent } from "../../src/agents/resource-agent";
import { RulesReferenceAgent } from "../../src/agents/rules-reference-agent";
import { SessionDigestAgent } from "../../src/agents/session-digest-agent";

/**
 * Regression guard for the reply that prompted cross-agent delegation: the file
 * agent telling a user it was "the part of LoreSmith that manages your uploaded
 * files", that it could not search inside their rulebook, and that they should
 * ask "in your main campaign conversation" instead.
 *
 * The user should never be asked to route their own request, so no agent's
 * system prompt may instruct it to send them somewhere else.
 */
const AGENTS = [
	CampaignAgent,
	CampaignAnalysisAgent,
	CampaignContextAgent,
	CampaignHelpAgent,
	CharacterAgent,
	CharacterSheetAgent,
	EncounterBuilderAgent,
	EntityGraphAgent,
	LootRewardAgent,
	RecapAgent,
	ResourceAgent,
	RulesReferenceAgent,
	SessionDigestAgent,
];

/**
 * Each pattern targets a phrasing that only ever appears in an instruction to
 * push the user somewhere else. Saying plainly what cannot be done is honest and
 * stays allowed, so there is deliberately no pattern for admitting a limit.
 */
const DEFLECTION_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
	{
		label: "redirect the user",
		pattern: /redirect\s+(them|the\s+user|users)/i,
	},
	{
		label: "send the user to another agent",
		pattern: /(ask|talk\s+to|use|contact)\s+the\s+\w+[\w\s-]*agent/i,
	},
	{
		label: "send the user to another conversation",
		pattern: /(in|to)\s+(your|the)\s+(main\s+)?campaign\s+conversation/i,
	},
	{
		label: "send the user to rephrase the request",
		pattern: /(guide|point|direct)\s+(them|the\s+user|users)\s+to\s+(use|try)/i,
	},
];

describe("agent system prompts never deflect to the user", () => {
	for (const agentClass of AGENTS) {
		const { type, systemPrompt } = agentClass.agentMetadata as {
			type: string;
			systemPrompt: string;
		};

		for (const { label, pattern } of DEFLECTION_PATTERNS) {
			it(`${type} does not instruct the model to ${label}`, () => {
				expect(systemPrompt).not.toMatch(pattern);
			});
		}
	}
});

describe("ResourceAgent prompt", () => {
	const prompt = ResourceAgent.agentMetadata.systemPrompt;

	it("tells the agent to hand off instead of sending the user away", () => {
		expect(prompt).toContain("askAnotherAgent");
		expect(prompt).toContain("Never tell the user that is not your area");
	});

	it("still scopes the agent's own tools to file management", () => {
		expect(prompt).toContain("file and resource management");
	});
});
