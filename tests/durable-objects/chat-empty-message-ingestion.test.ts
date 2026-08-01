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
	id: { toString: () => "ofisk-campaign-1" },
	storage: {
		get: vi.fn().mockResolvedValue(undefined),
		put: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(undefined),
	},
} as any;

/**
 * A turn that only made tool calls, or that the user interrupted before any
 * text streamed, arrives with no `text` part. Flattening it yields empty
 * content, and Anthropic rejects the whole request with
 * "messages: text content blocks must be non-empty". Because the client replays
 * the entire conversation on every turn, one such message would make the
 * conversation stop responding permanently.
 */
describe("Chat durable object empty-message ingestion", () => {
	let chat: Chat;

	beforeEach(() => {
		vi.clearAllMocks();
		chat = new Chat(mockCtx, mockEnv);
		// onRequest's job under test is building `this.messages`; the turn itself
		// is stubbed out so no provider call is attempted.
		(chat as any).onChatMessage = vi.fn().mockResolvedValue(new Response("ok"));
	});

	function post(messages: unknown[]): Promise<Response> {
		return chat.onRequest(
			new Request("https://test/api/agents/chat/ofisk-campaign-1", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ messages, data: { campaignId: "campaign-1" } }),
			})
		);
	}

	it("drops a tool-call-only assistant turn instead of sending empty content", async () => {
		await post([
			{ role: "user", parts: [{ type: "text", text: "list my NPCs" }] },
			{
				role: "assistant",
				parts: [
					{ type: "step-start" },
					{ type: "tool-listAllEntities", state: "output-available" },
				],
			},
			{
				role: "user",
				parts: [{ type: "text", text: "what's Grik's voice sound like?" }],
			},
		]);

		const messages = (chat as any).messages as Array<{
			role: string;
			content: string;
		}>;

		expect(messages).toHaveLength(2);
		expect(messages.every((m) => m.content.trim().length > 0)).toBe(true);
		expect(messages[1].content).toBe("what's Grik's voice sound like?");
	});

	it("drops an interrupted assistant turn that streamed no text", async () => {
		await post([
			{ role: "user", parts: [{ type: "text", text: "tell me about Grik" }] },
			{ role: "assistant", parts: [{ type: "text", text: "" }] },
			{ role: "user", parts: [{ type: "text", text: "still there?" }] },
		]);

		const messages = (chat as any).messages as Array<{ content: string }>;

		expect(messages.map((m) => m.content)).toEqual([
			"tell me about Grik",
			"still there?",
		]);
	});

	it("still attaches jwt and campaignId to the surviving last user message", async () => {
		await post([
			{
				role: "assistant",
				parts: [{ type: "tool-searchCampaignContext", state: "output-error" }],
			},
			{ role: "user", parts: [{ type: "text", text: "who is Grik?" }] },
		]);

		const messages = (chat as any).messages as Array<{
			role: string;
			content: string;
			data?: { campaignId?: string };
		}>;

		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("user");
		expect(messages[0].data?.campaignId).toBe("campaign-1");
	});

	it("keeps a conversation with no empty turns intact", async () => {
		await post([
			{ role: "user", parts: [{ type: "text", text: "hi" }] },
			{ role: "assistant", parts: [{ type: "text", text: "hello there" }] },
			{ role: "user", parts: [{ type: "text", text: "who is Grik?" }] },
		]);

		const messages = (chat as any).messages as Array<{ content: string }>;

		expect(messages.map((m) => m.content)).toEqual([
			"hi",
			"hello there",
			"who is Grik?",
		]);
	});
});
