import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../src/agents/base-agent";

vi.mock("@/lib/agent-role-utils", () => ({
	resolveClaimedPlayerContext: vi.fn().mockResolvedValue(null),
}));

const streamTextMock = vi.hoisted(() => vi.fn());
const recordUsageMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/services/llm/llm-rate-limit-service", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/services/llm/llm-rate-limit-service")
		>();
	return {
		...actual,
		getLLMRateLimitService: () => ({ recordUsage: recordUsageMock }),
	};
});

/** Unsigned JWT — base-agent only base64-decodes the payload for the username. */
function jwtFor(username: string): string {
	const payload = btoa(JSON.stringify({ username }))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	return `header.${payload}.signature`;
}

vi.mock("ai", async (importOriginal) => {
	const actual = await importOriginal<typeof import("ai")>();
	return {
		...actual,
		streamText: streamTextMock,
		stepCountIs: vi.fn(() => () => false),
	};
});

// DB is truthy so the persistence path runs; the DAO call itself is spied on.
const mockEnv = {
	DB: {} as D1Database,
	R2: {} as R2Bucket,
	VECTORIZE: {} as any,
	AI: {} as any,
	JWT_SECRET: "test-jwt-secret",
	Chat: {} as DurableObjectNamespace,
	UserFileTracker: {} as DurableObjectNamespace,
	UploadSession: {} as DurableObjectNamespace,
	ASSETS: {} as any,
	NOTIFICATIONS: {} as DurableObjectNamespace,
	FILE_PROCESSING_QUEUE: {} as any,
	FILE_PROCESSING_DLQ: {} as any,
} as any;

const mockCtx = {
	env: mockEnv,
	id: { toString: () => "session-under-test" },
	state: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
} as any;

/** Uses BaseAgent's real onChatMessage rather than overriding it. */
class RealBaseAgent extends BaseAgent {
	constructor() {
		super(mockCtx, mockEnv, { generateText: vi.fn() } as any, {});
	}
}

function makeStreamTextResult() {
	return {
		text: Promise.resolve("full response"),
		toUIMessageStreamResponse: vi.fn().mockReturnValue(
			new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
						controller.close();
					},
				}),
				{ headers: { "Content-Type": "text/event-stream" } }
			)
		),
	};
}

describe("BaseAgent interrupt handling", () => {
	let agent: RealBaseAgent;

	beforeEach(() => {
		vi.clearAllMocks();
		streamTextMock.mockReturnValue(makeStreamTextResult());
		agent = new RealBaseAgent();
		agent.addMessage({ role: "user", content: "Tell me about the campaign" });
	});

	it("passes the turn's abort signal to the provider call", async () => {
		const controller = new AbortController();

		await agent.onChatMessage(() => {}, { abortSignal: controller.signal });

		expect(streamTextMock).toHaveBeenCalledTimes(1);
		// Previously the option was accepted and dropped, so a stopped turn kept
		// generating (and billing) server-side.
		expect(streamTextMock.mock.calls[0][0].abortSignal).toBe(controller.signal);
	});

	it("omits abortSignal entirely when no signal is supplied", async () => {
		await agent.onChatMessage(() => {});

		expect(streamTextMock.mock.calls[0][0]).not.toHaveProperty("abortSignal");
	});

	it("persists the partial reply when the turn is aborted", async () => {
		const storeSpy = vi
			.spyOn(agent as any, "storeMessageToDatabase")
			.mockResolvedValue(undefined);

		await agent.onChatMessage(() => {}, {
			abortSignal: new AbortController().signal,
		});

		const { onAbort } = streamTextMock.mock.calls[0][0];
		expect(onAbort).toBeTypeOf("function");

		await onAbort({
			steps: [
				{ text: "The party ", usage: { totalTokens: 10 } },
				{ text: "arrives at", usage: { totalTokens: 5 } },
			],
		});

		expect(storeSpy).toHaveBeenCalledTimes(1);
		const stored = storeSpy.mock.calls[0][0] as any;
		expect(stored.role).toBe("assistant");
		expect(stored.content).toContain("The party arrives at");
		// Drives the "Stopped — this reply is incomplete" notice after a reload.
		expect(stored.data.interrupted).toBe(true);
	});

	it("attributes an aborted turn's spend with the input/output split intact", async () => {
		vi.spyOn(agent as any, "storeMessageToDatabase").mockResolvedValue(
			undefined
		);
		agent.addMessage({
			role: "user",
			content: "Tell me about the campaign",
			data: { jwt: jwtFor("tester") },
		} as any);

		await agent.onChatMessage(() => {}, {
			abortSignal: new AbortController().signal,
		});

		const { onAbort } = streamTextMock.mock.calls[0][0];
		await onAbort({
			// AI SDK v7 field naming. Reading v4's promptTokens/completionTokens
			// here yields a zero split, which would make the spend unpriceable —
			// output tokens cost ~5x input, so the aggregate alone is not enough.
			steps: [
				{ text: "The party ", usage: { inputTokens: 100, outputTokens: 20 } },
				{ text: "arrives at", usage: { inputTokens: 50, outputTokens: 10 } },
			],
		});

		expect(recordUsageMock).toHaveBeenCalledTimes(1);
		const [username, tokens, queryCount, model, meta] =
			recordUsageMock.mock.calls[0];
		expect(username).toBe("tester");
		expect(tokens).toBe(180);
		expect(queryCount).toBe(1);
		// Pricing needs the model id; recording it as undefined leaves the event unpriced.
		expect(model).toBeTruthy();
		expect(meta).toMatchObject({
			source: "base_agent:onChatMessage_aborted",
			modelRole: "INTERACTIVE",
			promptTokens: 150,
			completionTokens: 30,
			totalTokens: 180,
		});
	});

	it("stores nothing when the turn is aborted before any text", async () => {
		const storeSpy = vi
			.spyOn(agent as any, "storeMessageToDatabase")
			.mockResolvedValue(undefined);

		await agent.onChatMessage(() => {}, {
			abortSignal: new AbortController().signal,
		});

		const { onAbort } = streamTextMock.mock.calls[0][0];
		await onAbort({ steps: [] });

		expect(storeSpy).not.toHaveBeenCalled();
	});
});
