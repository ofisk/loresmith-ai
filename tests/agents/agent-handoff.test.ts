import { beforeEach, describe, expect, it, vi } from "vitest";

const generateTextMock = vi.fn();

vi.mock("ai", async (importOriginal) => {
	const actual = await importOriginal<typeof import("ai")>();
	return {
		...actual,
		generateText: (...args: unknown[]) => generateTextMock(...args),
		stepCountIs: vi.fn((n: number) => n),
	};
});

const { BaseAgent } = await import("../../src/agents/base-agent");
const { AgentRouter } = await import("../../src/lib/agent-router");
type AgentType = import("../../src/lib/agent-router").AgentType;

const mockEnv = { DB: undefined } as any;
const mockCtx = { env: mockEnv, state: { get: vi.fn(), put: vi.fn() } } as any;
const mockModel = { modelId: "test-model" };

const searchRulesTool = {
	description: "Search indexed rulebooks",
	execute: vi.fn().mockResolvedValue("rules result"),
	parameters: { shape: { query: {} } },
};
const gmOnlyRulesTools = {
	searchRulesTool,
	editHouseRulesTool: { ...searchRulesTool },
};
const playerRulesTools = { searchRulesTool };

class RulesReferenceStub {
	protected getToolsForRole(role: string | null) {
		return role === "gm" ? gmOnlyRulesTools : playerRulesTools;
	}
}

const fileTools = {
	listFiles: {
		description: "List files",
		execute: vi.fn().mockResolvedValue("files"),
		parameters: { shape: {} },
	},
};

class ResourceStub extends BaseAgent {
	static readonly agentMetadata = {
		type: "resources",
		description: "Manages uploaded files.",
		systemPrompt: "resource prompt",
		tools: fileTools,
	};

	constructor() {
		super(mockCtx, mockEnv, mockModel, fileTools);
	}

	async onChatMessage(): Promise<Response> {
		return new Response("unused");
	}
}

function registerAgents() {
	for (const agentType of AgentRouter.getRegisteredAgentTypes()) {
		delete (AgentRouter as any).agentRegistry[agentType];
	}
	AgentRouter.registerAgent(
		"rules-reference" as AgentType,
		RulesReferenceStub,
		gmOnlyRulesTools,
		"rules reference prompt",
		"Answers rules questions from indexed rulebooks."
	);
	AgentRouter.registerAgent(
		"resources" as AgentType,
		ResourceStub,
		fileTools,
		"resource prompt",
		"Manages uploaded files."
	);
}

describe("BaseAgent cross-agent handoff", () => {
	let agent: ResourceStub;

	beforeEach(() => {
		vi.clearAllMocks();
		registerAgents();
		agent = new ResourceStub();
	});

	describe("askAnotherAgent availability", () => {
		it("is offered alongside the agent's own tools", () => {
			const tools = (agent as any).createEnhancedTools("jwt", "campaign-1");

			expect(Object.keys(tools)).toContain("listFiles");
			expect(Object.keys(tools)).toContain("askAnotherAgent");
		});

		it("names the other registered agents but not the caller", () => {
			const tools = (agent as any).createEnhancedTools("jwt", "campaign-1");

			expect(tools.askAnotherAgent.description).toContain("rules-reference");
			expect(tools.askAnotherAgent.description).not.toContain(
				"- resources: Manages uploaded files."
			);
		});

		// Without this the delegate could delegate onward, and a handoff loop
		// would burn the whole turn inside nested model calls.
		it("is withheld from an agent running as someone else's delegate", () => {
			const tools = (agent as any).createEnhancedTools(
				"jwt",
				"campaign-1",
				undefined,
				fileTools,
				{ allowDelegation: false }
			);

			expect(Object.keys(tools)).not.toContain("askAnotherAgent");
		});

		it("is omitted when no other agent is registered", () => {
			for (const agentType of AgentRouter.getRegisteredAgentTypes()) {
				delete (AgentRouter as any).agentRegistry[agentType];
			}

			const tools = (agent as any).createEnhancedTools("jwt", "campaign-1");

			expect(Object.keys(tools)).not.toContain("askAnotherAgent");
		});
	});

	describe("runDelegatedAgent", () => {
		beforeEach(() => {
			generateTextMock.mockResolvedValue({
				text: "  The Foundling trains ...  ",
			});
		});

		it("runs the target agent's prompt and tools and returns its answer", async () => {
			const result = await (agent as any).runDelegatedAgent({
				agentType: "rules-reference",
				request: "What trainings does The Foundling start with?",
				campaignRole: "gm",
				clientJwt: "jwt",
				selectedCampaignId: "campaign-1",
			});

			expect(generateTextMock).toHaveBeenCalledTimes(1);
			const call = generateTextMock.mock.calls[0][0];
			expect(call.system).toBe("rules reference prompt");
			expect(call.messages).toEqual([
				{
					role: "user",
					content: "What trainings does The Foundling start with?",
				},
			]);
			expect(Object.keys(call.tools)).toContain("searchRulesTool");
			expect(result).toEqual({
				agent: "rules-reference",
				answer: "The Foundling trains ...",
				toolsUsed: [],
			});
		});

		it("gives the delegate only the tools the caller's role may use", async () => {
			await (agent as any).runDelegatedAgent({
				agentType: "rules-reference",
				request: "anything",
				campaignRole: "player",
				clientJwt: "jwt",
				selectedCampaignId: "campaign-1",
			});

			const call = generateTextMock.mock.calls[0][0];
			expect(Object.keys(call.tools)).toContain("searchRulesTool");
			expect(Object.keys(call.tools)).not.toContain("editHouseRulesTool");
		});

		it("does not hand the delegate a delegation tool of its own", async () => {
			await (agent as any).runDelegatedAgent({
				agentType: "rules-reference",
				request: "anything",
				campaignRole: "gm",
				clientJwt: "jwt",
				selectedCampaignId: "campaign-1",
			});

			const call = generateTextMock.mock.calls[0][0];
			expect(Object.keys(call.tools)).not.toContain("askAnotherAgent");
		});

		it("returns an empty answer without a model call when the role has no tools", async () => {
			AgentRouter.registerAgent(
				"gm-only" as AgentType,
				class {
					protected getToolsForRole() {
						return {};
					}
				},
				{},
				"gm only prompt",
				"GM only."
			);

			const result = await (agent as any).runDelegatedAgent({
				agentType: "gm-only",
				request: "anything",
				campaignRole: "player",
				clientJwt: "jwt",
				selectedCampaignId: "campaign-1",
			});

			expect(generateTextMock).not.toHaveBeenCalled();
			expect(result.answer).toBe("");
		});
	});

	describe("end-to-end through the tool", () => {
		it("returns the delegate's answer to the calling agent", async () => {
			generateTextMock.mockResolvedValue({
				text: "The Foundling starts with one training.",
			});
			const tools = (agent as any).createEnhancedTools(
				"jwt",
				"campaign-1",
				undefined,
				fileTools,
				{
					campaignRole: "gm",
				}
			);

			const result = await tools.askAnotherAgent.execute(
				{
					agentType: "rules-reference",
					request: "What trainings does The Foundling start with?",
					reason: "needs the rulebook",
				},
				{ toolCallId: "call-1" }
			);

			expect(result.result.success).toBe(true);
			expect(result.result.data.answer).toBe(
				"The Foundling starts with one training."
			);
			expect(result.result.data.agent).toBe("rules-reference");
		});
	});
});
