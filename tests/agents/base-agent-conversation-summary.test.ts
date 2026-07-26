import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../src/agents/base-agent";
import {
	CONVERSATION_SUMMARY_ENV,
	CONVERSATION_SUMMARY_STORAGE_KEY,
	RECENT_MESSAGE_WINDOW,
	RESUMMARIZE_BATCH_SIZE,
	SUMMARIZATION_TRIGGER_COUNT,
} from "../../src/lib/conversation-summarization";

vi.mock("@/lib/agent-role-utils", () => ({
	resolveClaimedPlayerContext: vi.fn().mockResolvedValue(null),
}));

// Keep the real (pure) planning logic; stub only the LLM call.
const summarizeConversationMock = vi.fn();
vi.mock("@/lib/conversation-summarization", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../../src/lib/conversation-summarization")
		>();
	return {
		...actual,
		summarizeConversation: (...args: unknown[]) =>
			summarizeConversationMock(...args),
	};
});

function makeStorage(initial?: unknown) {
	const store = new Map<string, unknown>();
	if (initial !== undefined) {
		store.set(CONVERSATION_SUMMARY_STORAGE_KEY, initial);
	}
	return {
		store,
		get: vi.fn(async (key: string) => store.get(key)),
		put: vi.fn(async (key: string, value: unknown) => {
			store.set(key, value);
		}),
		delete: vi.fn(async (key: string) => store.delete(key)),
	};
}

function makeEnv(overrides: Record<string, unknown> = {}) {
	return {
		DB: undefined,
		ANTHROPIC_API_KEY: "test-anthropic-key",
		...overrides,
	} as any;
}

class TestAgent extends BaseAgent {
	static agentMetadata = {
		type: "test",
		description: "test agent",
		systemPrompt: "system",
		tools: [],
	};

	async onChatMessage(): Promise<Response> {
		return new Response("ok");
	}

	// Expose the protected hook under test.
	build(messages: any[], max: number, jwt: string | null = null) {
		return (this as any).buildConversationContext(messages, max, jwt);
	}
}

function makeAgent(storage: ReturnType<typeof makeStorage>, env = makeEnv()) {
	const ctx = { storage, env } as any;
	return new TestAgent(ctx, env, { modelId: "test-model" } as any, {});
}

/** Alternating user/assistant history. */
function makeMessages(count: number) {
	return Array.from({ length: count }, (_, i) => ({
		role: i % 2 === 0 ? "user" : "assistant",
		content: `message-${i}`,
	})) as any[];
}

describe("BaseAgent.buildConversationContext", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		summarizeConversationMock.mockResolvedValue({
			summary: "## Campaign\nTone: grimdark",
			usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
			modelId: "claude-haiku-4-5",
		});
	});

	it("leaves short conversations untouched and never calls the model", async () => {
		const storage = makeStorage();
		const messages = makeMessages(6);

		const result = await makeAgent(storage).build(messages, 32);

		expect(result.messages).toEqual(messages);
		expect(result.summaryBlock).toBeNull();
		expect(summarizeConversationMock).not.toHaveBeenCalled();
		expect(storage.put).not.toHaveBeenCalled();
	});

	it("summarizes older turns and persists the rolling state", async () => {
		const storage = makeStorage();
		const messages = makeMessages(SUMMARIZATION_TRIGGER_COUNT);

		const result = await makeAgent(storage).build(messages, 32);

		expect(summarizeConversationMock).toHaveBeenCalledTimes(1);
		const call = summarizeConversationMock.mock.calls[0][0];
		expect(call.messagesToSummarize).toHaveLength(RESUMMARIZE_BATCH_SIZE);
		expect(call.priorSummary).toBeNull();
		expect(call.apiKey).toBe("test-anthropic-key");

		expect(result.messages).toHaveLength(RECENT_MESSAGE_WINDOW);
		expect(result.summaryBlock).toContain("## Earlier conversation summary");
		expect(result.summaryBlock).toContain("Tone: grimdark");

		const persisted = storage.store.get(
			CONVERSATION_SUMMARY_STORAGE_KEY
		) as any;
		expect(persisted.coveredCount).toBe(RESUMMARIZE_BATCH_SIZE);
		expect(persisted.summary).toBe("## Campaign\nTone: grimdark");
		expect(persisted.fingerprint).toEqual(expect.any(String));
	});

	it("reuses the persisted summary on the next turn without a model call", async () => {
		const storage = makeStorage();
		const agent = makeAgent(storage);

		await agent.build(makeMessages(SUMMARIZATION_TRIGGER_COUNT), 32);
		summarizeConversationMock.mockClear();

		// One more turn: not enough has aged out to justify another call.
		const result = await agent.build(
			makeMessages(SUMMARIZATION_TRIGGER_COUNT + 2),
			32
		);

		expect(summarizeConversationMock).not.toHaveBeenCalled();
		expect(result.summaryBlock).toContain("Tone: grimdark");
		// The not-yet-summarized stragglers stay verbatim.
		expect(result.messages.length).toBeGreaterThan(RECENT_MESSAGE_WINDOW);
	});

	it("folds the prior summary into the next batch", async () => {
		const storage = makeStorage();
		const agent = makeAgent(storage);

		await agent.build(makeMessages(SUMMARIZATION_TRIGGER_COUNT), 32);
		summarizeConversationMock.mockClear();

		await agent.build(
			makeMessages(SUMMARIZATION_TRIGGER_COUNT + RESUMMARIZE_BATCH_SIZE),
			32
		);

		expect(summarizeConversationMock).toHaveBeenCalledTimes(1);
		expect(summarizeConversationMock.mock.calls[0][0].priorSummary).toBe(
			"## Campaign\nTone: grimdark"
		);
	});

	it("still caps the verbatim tail at maxContextMessages", async () => {
		const storage = makeStorage();
		const messages = makeMessages(SUMMARIZATION_TRIGGER_COUNT);

		const result = await makeAgent(storage).build(messages, 4);

		expect(result.messages).toHaveLength(4);
		expect(result.messages).toEqual(messages.slice(-4));
	});

	it("falls back to the plain trailing window when summarization throws", async () => {
		summarizeConversationMock.mockRejectedValue(new Error("provider down"));
		const storage = makeStorage();
		const messages = makeMessages(SUMMARIZATION_TRIGGER_COUNT);

		const result = await makeAgent(storage).build(messages, 32);

		expect(result.summaryBlock).toBeNull();
		expect(result.messages).toEqual(messages);
		expect(storage.put).not.toHaveBeenCalled();
	});

	it("falls back when the model returns an empty summary", async () => {
		summarizeConversationMock.mockResolvedValue({
			summary: "",
			usage: undefined,
			modelId: "claude-haiku-4-5",
		});
		const storage = makeStorage();
		const messages = makeMessages(SUMMARIZATION_TRIGGER_COUNT);

		const result = await makeAgent(storage).build(messages, 32);

		expect(result.summaryBlock).toBeNull();
		expect(result.messages).toEqual(messages);
		expect(storage.put).not.toHaveBeenCalled();
	});

	it("skips summarization when no provider API key is available", async () => {
		const storage = makeStorage();
		const env = makeEnv({ ANTHROPIC_API_KEY: undefined });
		const messages = makeMessages(SUMMARIZATION_TRIGGER_COUNT);

		const result = await makeAgent(storage, env).build(messages, 32);

		expect(summarizeConversationMock).not.toHaveBeenCalled();
		expect(result.summaryBlock).toBeNull();
		// Nothing is summarized, so nothing may be silently dropped either.
		expect(result.messages).toEqual(messages);
	});

	it("is disabled by the env kill switch", async () => {
		const storage = makeStorage();
		const env = makeEnv({ [CONVERSATION_SUMMARY_ENV]: "false" });
		const messages = makeMessages(SUMMARIZATION_TRIGGER_COUNT);

		const result = await makeAgent(storage, env).build(messages, 32);

		expect(summarizeConversationMock).not.toHaveBeenCalled();
		expect(storage.get).not.toHaveBeenCalled();
		expect(result.summaryBlock).toBeNull();
		expect(result.messages).toEqual(messages);
	});

	it("falls back safely when the DO has no storage", async () => {
		const env = makeEnv();
		const agent = new TestAgent(
			{ env } as any,
			env,
			{ modelId: "test-model" } as any,
			{}
		);
		const messages = makeMessages(SUMMARIZATION_TRIGGER_COUNT);

		const result = await (agent as any).build(messages, 32);

		expect(summarizeConversationMock).not.toHaveBeenCalled();
		expect(result.summaryBlock).toBeNull();
		expect(result.messages).toEqual(messages);
	});
});
