import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chat } from "../../src/durable-objects/chat";

vi.mock("@/lib/agent-role-utils", () => ({
	resolveClaimedPlayerContext: vi.fn().mockResolvedValue(null),
}));

const mockEnv = {
	DB: undefined as unknown as D1Database,
	R2: {} as R2Bucket,
	VECTORIZE: {} as any,
	AI: {} as any,
	JWT_SECRET: "test-jwt-secret",
	CHAT: {} as DurableObjectNamespace,
	UPLOAD_SESSION: {} as DurableObjectNamespace,
	NOTIFICATIONS: {} as DurableObjectNamespace,
	ASSETS: {} as any,
	FILE_PROCESSING_QUEUE: {} as any,
	FILE_PROCESSING_DLQ: {} as any,
} as any;

const mockCtx = {
	env: mockEnv,
	id: { toString: () => "user-campaign-1" },
	storage: {
		get: vi.fn().mockResolvedValue(undefined),
		put: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(undefined),
	},
} as any;

/**
 * A conversation is one durable object instance, and every turn rewrites the
 * shared message array. Overlapping turns therefore corrupt each other's
 * context and interleave output, so turns must be single-flight.
 */
describe("Chat durable object turn supersede", () => {
	let chat: Chat;

	beforeEach(() => {
		vi.clearAllMocks();
		chat = new Chat(mockCtx, mockEnv);
	});

	function beginTurn(request: Request): AbortSignal {
		return (chat as any).beginTurn(request);
	}

	it("aborts the in-flight turn when a newer one starts", () => {
		const first = beginTurn(
			new Request("https://test/chat", { method: "POST" })
		);
		expect(first.aborted).toBe(false);

		const second = beginTurn(
			new Request("https://test/chat", { method: "POST" })
		);

		expect(first.aborted).toBe(true);
		expect(second.aborted).toBe(false);
	});

	it("propagates a client disconnect into the turn", () => {
		const controller = new AbortController();
		const signal = beginTurn(
			new Request("https://test/chat", {
				method: "POST",
				signal: controller.signal,
			})
		);

		expect(signal.aborted).toBe(false);
		controller.abort();
		expect(signal.aborted).toBe(true);
	});

	it("starts already-aborted when the client gave up before dispatch", () => {
		const controller = new AbortController();
		controller.abort();

		const signal = beginTurn(
			new Request("https://test/chat", {
				method: "POST",
				signal: controller.signal,
			})
		);

		expect(signal.aborted).toBe(true);
	});

	it("leaves a fresh turn usable after the previous one completed", () => {
		// Aborting an already-finished controller is a no-op, so completed turns
		// need no bookkeeping.
		beginTurn(new Request("https://test/chat", { method: "POST" }));
		const next = beginTurn(
			new Request("https://test/chat", { method: "POST" })
		);

		expect(next.aborted).toBe(false);
	});
});
