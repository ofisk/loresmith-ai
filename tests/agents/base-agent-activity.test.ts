import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingAgentActivityWrite } from "@/dao/agent-activity-dao";

/**
 * The activity log is written from `BaseAgent.createEnhancedTools`, the wrapper
 * every agent's every tool call already passes through (issue #739). These
 * tests exercise that path end to end: a tool call, a tool that throws, a tool
 * blocked by the wrapper's own guards, and a delegation tree.
 */

const saveMany = vi.fn<(rows: PendingAgentActivityWrite[]) => Promise<void>>();

vi.mock("@/dao/agent-activity-dao", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/dao/agent-activity-dao")>();
	return {
		...actual,
		AgentActivityDAO: class {
			saveMany(rows: PendingAgentActivityWrite[]) {
				return saveMany(rows);
			}
		},
	};
});

const generateTextMock = vi.fn();

vi.mock("ai", async (importOriginal) => {
	const actual = await importOriginal<typeof import("ai")>();
	return {
		...actual,
		generateText: (...args: unknown[]) => generateTextMock(...args),
		stepCountIs: vi.fn((n: number) => n),
	};
});

const { BaseAgent } = await import("@/agents/base-agent");
const { AgentRouter } = await import("@/lib/agent-router");
type AgentType = import("@/lib/agent-router").AgentType;

/** A JWT the agent can read a username out of; only the payload is parsed. */
function jwtFor(username: string): string {
	const payload = btoa(JSON.stringify({ username }));
	return `header.${payload}.signature`;
}

const mockEnv = { DB: {} } as any;
const mockCtx = {
	env: mockEnv,
	id: { toString: () => "do-session-1" },
	storage: { get: vi.fn(), put: vi.fn() },
} as any;
const mockModel = { modelId: "test-model" };

const searchRulesTool = {
	description: "Search indexed rulebooks",
	execute: vi.fn().mockResolvedValue({ success: true, message: "found" }),
	parameters: { shape: { query: {} } },
};
const rulesTools = { searchRules: searchRulesTool };

class RulesStub extends BaseAgent {
	static readonly agentMetadata = {
		type: "rules-reference",
		description: "Answers rules questions.",
		systemPrompt: "rules prompt",
		tools: rulesTools,
	};
	constructor() {
		super(mockCtx, mockEnv, mockModel, rulesTools);
	}
	async onChatMessage(): Promise<Response> {
		return new Response("unused");
	}
}

const listFilesTool = {
	description: "List files",
	execute: vi.fn().mockResolvedValue({ success: true, data: { id: "file-1" } }),
	parameters: { shape: { campaignId: {}, jwt: {} } },
};
const resourceTools = { listFiles: listFilesTool };

class ResourceStub extends BaseAgent {
	static readonly agentMetadata = {
		type: "resources",
		description: "Manages uploaded files.",
		systemPrompt: "resource prompt",
		tools: resourceTools,
	};
	constructor() {
		super(mockCtx, mockEnv, mockModel, resourceTools);
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
		RulesStub,
		rulesTools,
		"rules prompt",
		"Answers rules questions."
	);
	AgentRouter.registerAgent(
		"resources" as AgentType,
		ResourceStub,
		resourceTools,
		"resource prompt",
		"Manages uploaded files."
	);
}

/** Every row written across all flushes, latest state per id. */
function rows(): PendingAgentActivityWrite[] {
	const byId = new Map<string, PendingAgentActivityWrite>();
	for (const call of saveMany.mock.calls) {
		for (const row of call[0]) byId.set(row.id, row);
	}
	return [...byId.values()];
}

function rowFor(toolName: string): PendingAgentActivityWrite | undefined {
	return rows().find((row) => row.toolName === toolName);
}

/** Let the recorder's chained flushes drain. */
async function drain() {
	for (let i = 0; i < 5; i++) await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("BaseAgent activity logging", () => {
	let agent: ResourceStub;

	beforeEach(() => {
		vi.clearAllMocks();
		saveMany.mockResolvedValue(undefined);
		registerAgents();
		agent = new ResourceStub();
	});

	it("records a tool call with no per-agent instrumentation", async () => {
		const tools = (agent as any).createEnhancedTools(
			jwtFor("gm"),
			"camp-1",
			undefined,
			resourceTools,
			{ allowDelegation: false }
		);

		await tools.listFiles.execute({ campaignId: "camp-1" }, {});
		await drain();

		const row = rowFor("listFiles");
		expect(row).toBeDefined();
		expect(row?.username).toBe("gm");
		expect(row?.agentType).toBe("resources");
		expect(row?.campaignId).toBe("camp-1");
		expect(row?.sessionId).toBe("do-session-1");
		expect(row?.status).toBe("succeeded");
		expect(row?.actionType).toBe("tool_call");
	});

	it("never persists the JWT the wrapper injects into arguments", async () => {
		const tools = (agent as any).createEnhancedTools(
			jwtFor("gm"),
			"camp-1",
			undefined,
			resourceTools,
			{ allowDelegation: false }
		);

		await tools.listFiles.execute({ campaignId: "camp-1" }, {});
		await drain();

		// The tool really did receive the JWT...
		expect(listFilesTool.execute).toHaveBeenCalledWith(
			expect.objectContaining({ jwt: jwtFor("gm") }),
			expect.anything()
		);
		// ...and the log really did not.
		expect(JSON.stringify(rowFor("listFiles")?.summary)).not.toContain(
			jwtFor("gm")
		);
	});

	it("records a thrown tool error as failed and still rethrows", async () => {
		listFilesTool.execute.mockRejectedValueOnce(new Error("R2 unavailable"));
		const tools = (agent as any).createEnhancedTools(
			jwtFor("gm"),
			"camp-1",
			undefined,
			resourceTools,
			{ allowDelegation: false }
		);

		await expect(tools.listFiles.execute({}, {})).rejects.toThrow(
			"R2 unavailable"
		);
		await drain();

		const row = rowFor("listFiles");
		expect(row?.status).toBe("failed");
		expect(row?.error).toBe("R2 unavailable");
	});

	it("records calls the wrapper blocks itself, which return rather than throw", async () => {
		const tools = (agent as any).createEnhancedTools(
			jwtFor("gm"),
			"camp-1",
			undefined,
			resourceTools,
			{ allowDelegation: false }
		);

		// The loop guard trips on the fourth identical call.
		for (let i = 0; i < 4; i++) {
			await tools.listFiles.execute({ campaignId: "camp-1" }, {});
		}
		await drain();

		const blocked = rows().filter((row) => row.status === "failed");
		expect(blocked.length).toBeGreaterThan(0);
		expect(blocked[0].error).toBeNull();
		expect(blocked[0].summary?.message).toContain("too many times");
	});

	it("stays silent when the log is switched off", async () => {
		const disabledAgent = new ResourceStub();
		(disabledAgent as any).env = {
			DB: {},
			LORESMITH_AGENT_ACTIVITY_LOG: "false",
		};

		const tools = (disabledAgent as any).createEnhancedTools(
			jwtFor("gm"),
			"camp-1",
			undefined,
			resourceTools,
			{ allowDelegation: false }
		);
		await tools.listFiles.execute({ campaignId: "camp-1" }, {});
		await drain();

		expect(saveMany).not.toHaveBeenCalled();
	});

	it("writes nothing for an unauthenticated turn", async () => {
		const tools = (agent as any).createEnhancedTools(
			null,
			"camp-1",
			undefined,
			resourceTools,
			{ allowDelegation: false }
		);
		await tools.listFiles.execute({ campaignId: "camp-1" }, {});
		await drain();

		expect(saveMany).not.toHaveBeenCalled();
	});

	it("hangs a delegate's tool calls under the delegating call", async () => {
		generateTextMock.mockImplementation(async ({ tools }: any) => {
			await tools.searchRules.execute({ query: "grappling" }, {});
			return { text: "Grappling works like this." };
		});

		const tools = (agent as any).createEnhancedTools(
			jwtFor("gm"),
			"camp-1",
			undefined,
			resourceTools,
			{ campaignRole: "gm" }
		);

		await tools.askAnotherAgent.execute(
			{
				agentType: "rules-reference",
				request: "How does grappling work?",
				reason: "rules question",
			},
			{ toolCallId: "call-1" }
		);
		await drain();

		const delegation = rowFor("askAnotherAgent");
		const delegateWork = rowFor("searchRules");

		expect(delegation?.actionType).toBe("delegation");
		expect(delegation?.agentType).toBe("resources");

		// The delegate's work is attributed to the delegate, and linked to the
		// call that caused it — the join #281 renders as per-agent badges.
		expect(delegateWork?.agentType).toBe("rules-reference");
		expect(delegateWork?.parentId).toBe(delegation?.id);
		expect(delegateWork?.rootId).toBe(delegation?.rootId);
		expect(delegateWork?.campaignId).toBe("camp-1");
		expect(delegateWork?.username).toBe("gm");
	});
});
