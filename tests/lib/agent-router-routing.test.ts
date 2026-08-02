import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	CONTEXT_RECAP_PLACEHOLDER,
	UI_INITIATED_PROMPTS,
} from "../../src/app-constants";

const generateTextMock = vi.fn();

vi.mock("ai", () => ({
	generateText: (...args: unknown[]) => generateTextMock(...args),
}));

vi.mock("../../src/lib/model-manager", () => ({
	ModelManager: {
		getInstance: () => ({
			getApiKey: () => "test-key",
			getModel: () => ({ modelId: "claude-haiku-4-5" }),
		}),
	},
}));

vi.mock("../../src/lib/model-config", () => ({
	createModel: (modelId: string) => ({ modelId }),
}));

import { AgentRouter } from "../../src/lib/agent-router";

const AGENTS = [
	"campaign",
	"recap",
	"session-digest",
	"onboarding",
	"resources",
	"rules-reference",
	"audio",
] as const;

function registerTestAgents() {
	for (const agent of AGENTS) {
		AgentRouter.registerAgent(
			agent as never,
			class {},
			{},
			`system prompt for ${agent}`,
			`Handles ${agent} work`
		);
	}
}

describe("AgentRouter.routeMessage layering", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		registerTestAgents();
		generateTextMock.mockResolvedValue({
			text: "campaign|85|Campaign listing",
			usage: { totalTokens: 120 },
		});
	});

	it("uses an explicit client hint without calling the model", async () => {
		const intent = await AgentRouter.routeMessage(
			"anything at all",
			undefined,
			null,
			undefined,
			{ messageData: { agentType: "session-digest" } }
		);

		expect(intent.agent).toBe("session-digest");
		expect(intent.source).toBe("explicit-hint");
		expect(intent.confidence).toBe(100);
		expect(generateTextMock).not.toHaveBeenCalled();
	});

	it("ignores an unregistered hint and falls through to the classifier", async () => {
		const intent = await AgentRouter.routeMessage(
			"show me campaigns",
			undefined,
			null,
			undefined,
			{ messageData: { agentType: "totally-made-up" } }
		);

		expect(intent.agent).toBe("campaign");
		expect(intent.source).toBe("llm");
		expect(generateTextMock).toHaveBeenCalledTimes(1);
	});

	it("routes deterministically for the recap sentinel without calling the model", async () => {
		const intent = await AgentRouter.routeMessage(CONTEXT_RECAP_PLACEHOLDER);

		expect(intent.agent).toBe("recap");
		expect(intent.source).toBe("deterministic");
		expect(generateTextMock).not.toHaveBeenCalled();
	});

	it("routes deterministically for UI-initiated prompts without calling the model", async () => {
		const help = await AgentRouter.routeMessage(UI_INITIATED_PROMPTS.HELP);
		expect(help.agent).toBe("onboarding");
		expect(help.source).toBe("deterministic");

		const recap = await AgentRouter.routeMessage(
			UI_INITIATED_PROMPTS.SESSION_RECAP
		);
		expect(recap.agent).toBe("session-digest");
		expect(recap.source).toBe("deterministic");

		expect(generateTextMock).not.toHaveBeenCalled();
	});

	// Issue #788: this exact message reached an agent with no audio tools and
	// was answered with a flat "I cannot generate audio".
	it("routes audio generation to the audio agent without calling the model", async () => {
		const intent = await AgentRouter.routeMessage(
			"generate music for this campaign"
		);

		expect(intent.agent).toBe("audio");
		expect(intent.source).toBe("deterministic");
		expect(intent.confidence).toBe(100);
		expect(generateTextMock).not.toHaveBeenCalled();
	});

	it("routes scene ambience to the audio agent without calling the model", async () => {
		const intent = await AgentRouter.routeMessage(
			"Make ambience for the crypt scene"
		);

		expect(intent.agent).toBe("audio");
		expect(intent.source).toBe("deterministic");
		expect(generateTextMock).not.toHaveBeenCalled();
	});

	it("calls the classifier for ambiguous messages", async () => {
		generateTextMock.mockResolvedValue({
			text: "rules-reference|95|Rules lookup",
			usage: { totalTokens: 130 },
		});

		const intent = await AgentRouter.routeMessage(
			"what should I do next about the grappling rules?"
		);

		expect(intent.agent).toBe("rules-reference");
		expect(intent.confidence).toBe(95);
		expect(intent.source).toBe("llm");
		expect(generateTextMock).toHaveBeenCalledTimes(1);
	});

	it("falls back to resources when the classifier names an unregistered agent", async () => {
		generateTextMock.mockResolvedValue({
			text: "nonexistent-agent|95|nope",
			usage: { totalTokens: 100 },
		});

		const intent = await AgentRouter.routeMessage("something ambiguous here");

		expect(intent.agent).toBe("resources");
		expect(intent.confidence).toBe(30);
		expect(intent.source).toBe("fallback");
	});

	it("falls back to resources when the classifier call throws", async () => {
		generateTextMock.mockRejectedValue(new Error("provider down"));

		const intent = await AgentRouter.routeMessage("something ambiguous here");

		expect(intent.agent).toBe("resources");
		expect(intent.source).toBe("fallback");
	});
});

describe("AgentRouter classifier prompt structure", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		registerTestAgents();
		generateTextMock.mockResolvedValue({
			text: "campaign|85|Campaign listing",
			usage: { totalTokens: 120 },
		});
	});

	it("sends the stable block behind a cache breakpoint and the message after it", async () => {
		await AgentRouter.routeMessage(
			"an ambiguous message about several things",
			"some recent context"
		);

		const call = generateTextMock.mock.calls[0][0] as {
			system: string;
			messages: Array<{
				role: string;
				content: Array<{
					type: string;
					text: string;
					providerOptions?: Record<string, unknown>;
				}>;
			}>;
		};

		const [cacheable, variable] = call.messages[0].content;

		expect(cacheable.providerOptions).toEqual({
			anthropic: { cacheControl: { type: "ephemeral" } },
		});
		expect(cacheable.text).toContain("Routing rules:");
		expect(cacheable.text).toContain("Handles recap work");
		expect(cacheable.text).not.toContain("an ambiguous message");

		expect(variable.providerOptions).toBeUndefined();
		expect(variable.text).toContain(
			"an ambiguous message about several things"
		);
		expect(variable.text).toContain("some recent context");
	});

	it("does not duplicate the agent registry into the system prompt", async () => {
		await AgentRouter.routeMessage("an ambiguous message about several things");

		const call = generateTextMock.mock.calls[0][0] as { system: string };

		// The descriptions used to appear in both the system prompt and the user
		// message, doubling the token cost of every routing call.
		expect(call.system).not.toContain("Handles recap work");
		expect(call.system).toContain("agent_type|confidence|reason");
	});
});
