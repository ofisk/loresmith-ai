import { describe, expect, it, vi } from "vitest";
import { getStatusMessageForTool } from "../../src/lib/agent-status-messages";
import {
	AGENT_HANDOFF_SYSTEM_RULE,
	buildAskAnotherAgentDescription,
	createAskAnotherAgentTool,
	type DelegationCatalogEntry,
} from "../../src/tools/common/agent-handoff-tools";

const catalog: DelegationCatalogEntry[] = [
	{ agent: "rules-reference", description: "Answers rules questions." },
	{ agent: "campaign", description: "Manages campaigns." },
];

function execute(tool: any, input: unknown) {
	return tool.execute(input, { toolCallId: "call-1" });
}

describe("buildAskAnotherAgentDescription", () => {
	it("lists every delegable agent with its description", () => {
		const description = buildAskAnotherAgentDescription(catalog);

		expect(description).toContain("rules-reference: Answers rules questions.");
		expect(description).toContain("campaign: Manages campaigns.");
	});

	it("tells the model the delegate cannot see the conversation", () => {
		expect(buildAskAnotherAgentDescription(catalog)).toContain(
			"cannot see this conversation"
		);
	});
});

describe("AGENT_HANDOFF_SYSTEM_RULE", () => {
	// This rule exists to stop the exact reply that prompted this work: an agent
	// telling the user it is "the part of LoreSmith that manages files" and to
	// ask elsewhere. If these prohibitions get softened, that reply comes back.
	it("forbids naming other agents or redirecting the user", () => {
		expect(AGENT_HANDOFF_SYSTEM_RULE).toContain("NEVER");
		expect(AGENT_HANDOFF_SYSTEM_RULE).toContain("ask elsewhere");
		expect(AGENT_HANDOFF_SYSTEM_RULE).toContain(
			"NEVER name another agent to the user"
		);
		expect(AGENT_HANDOFF_SYSTEM_RULE).toContain("askAnotherAgent");
	});
});

describe("createAskAnotherAgentTool", () => {
	it("relays the delegate's answer back to the caller", async () => {
		const run = vi.fn().mockResolvedValue({
			agent: "rules-reference",
			answer: "The Foundling starts with the Waterbending training.",
			toolsUsed: ["searchRulesTool"],
		});
		const tool = createAskAnotherAgentTool({ catalog, run });

		const result = await execute(tool, {
			agentType: "rules-reference",
			request: "What trainings does The Foundling start with?",
			reason: "needs rulebook search",
		});

		expect(run).toHaveBeenCalledWith({
			agentType: "rules-reference",
			request: "What trainings does The Foundling start with?",
		});
		expect(result.result.success).toBe(true);
		expect(result.result.data.answer).toContain("Waterbending");
		expect(result.result.data.toolsUsed).toEqual(["searchRulesTool"]);
	});

	it("instructs the caller to relay the answer without mentioning the handoff", async () => {
		const tool = createAskAnotherAgentTool({
			catalog,
			run: vi
				.fn()
				.mockResolvedValue({ agent: "campaign", answer: "ok", toolsUsed: [] }),
		});

		const result = await execute(tool, {
			agentType: "campaign",
			request: "add the file",
			reason: "campaign work",
		});

		expect(result.result.message).toContain("in your own voice");
		expect(result.result.message).toContain(
			"Do not mention that another agent was involved"
		);
	});

	it("rejects an agent that is not in the catalog without running anything", async () => {
		const run = vi.fn();
		const tool = createAskAnotherAgentTool({ catalog, run });

		const result = await execute(tool, {
			agentType: "made-up-agent",
			request: "do something",
			reason: "guessing",
		});

		expect(run).not.toHaveBeenCalled();
		expect(result.result.success).toBe(false);
		expect(result.result.message).toContain("not an available agent");
		expect(result.result.message).toContain("rules-reference");
	});

	it("reports an empty delegate answer as a failure so the caller retries", async () => {
		const tool = createAskAnotherAgentTool({
			catalog,
			run: vi.fn().mockResolvedValue({
				agent: "rules-reference",
				answer: "   ",
				toolsUsed: [],
			}),
		});

		const result = await execute(tool, {
			agentType: "rules-reference",
			request: "anything",
			reason: "test",
		});

		expect(result.result.success).toBe(false);
		expect(result.result.message).toContain("returned nothing");
	});

	it("keeps a delegate failure internal and tells the caller not to deflect", async () => {
		const tool = createAskAnotherAgentTool({
			catalog,
			run: vi.fn().mockRejectedValue(new Error("model unavailable")),
		});

		const result = await execute(tool, {
			agentType: "campaign",
			request: "anything",
			reason: "test",
		});

		expect(result.result.success).toBe(false);
		expect(result.result.message).toContain("model unavailable");
		expect(result.result.message).toContain(
			"do not tell the user to ask elsewhere"
		);
	});
});

describe("handoff status message", () => {
	// Tool names reach the user through the thinking spinner, so the handoff's
	// status line must read as one assistant working, not as a routing step.
	it("describes the wait without revealing that another agent ran", () => {
		const message = getStatusMessageForTool("askAnotherAgent");

		expect(message).not.toBe("Gathering information...");
		expect(message.toLowerCase()).not.toContain("agent");
		expect(message.toLowerCase()).not.toContain("specialist");
		expect(message.toLowerCase()).not.toContain("hand");
	});
});
