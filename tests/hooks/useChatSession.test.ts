// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatSession } from "@/hooks/useChatSession";

// Mutable stand-in for the AI SDK chat state so tests can drive `status`
// between "streaming" and "ready" the way a real turn does.
const chatMock = vi.hoisted(() => ({
	messages: [] as any[],
	status: "ready" as string,
	sendMessage: vi.fn(),
	setMessages: vi.fn(),
	stop: vi.fn(),
	regenerate: vi.fn(),
	error: undefined as Error | undefined,
}));

vi.mock("@ai-sdk/react", () => ({
	useChat: vi.fn(() => chatMock),
}));

vi.mock("@/lib/stream-status-interceptor", () => ({
	createStatusInterceptingFetch: vi.fn(() => fetch),
}));

vi.mock("@/shared-config", () => ({
	API_CONFIG: {
		getApiBaseUrl: () => "https://api.test",
		buildUrl: (path: string) => `https://api.test${path}`,
		ENDPOINTS: {
			CHAT: {
				HISTORY: (id: string) => `/chat/${id}/history`,
			},
		},
	},
}));

const mockAuthState = {
	getStoredJwt: vi.fn(() => "jwt"),
};

const mockModalState = {
	setShowAuthModal: vi.fn(),
	showRateLimitReachedModal: vi.fn(),
	handleUsageLimitsOpen: vi.fn(),
};

const mockAddLocalNotification = vi.fn();
const mockUpdateActivity = vi.fn();

const defaultOptions = {
	conversationId: "user-campaign-1",
	authState: mockAuthState,
	modalState: mockModalState,
	selectedCampaignId: "campaign-1",
	selectedCampaign: { role: "owner", campaignId: "campaign-1" } as any,
	chatContainerId: "chat-container",
	setTextareaHeight: vi.fn(),
	addLocalNotification: mockAddLocalNotification,
	updateActivity: mockUpdateActivity,
	authReady: true,
};

/** Apply the last functional updater passed to setMessages. */
function applyLastMessagesUpdate(current: any[]): any[] | null {
	const call = chatMock.setMessages.mock.calls
		.slice()
		.reverse()
		.find(([arg]) => typeof arg === "function");
	if (!call) return null;
	return (call[0] as (prev: any[]) => any[])(current);
}

describe("useChatSession", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		chatMock.messages = [];
		chatMock.status = "ready";
		chatMock.error = undefined;
		document.body.innerHTML = '<div id="chat-container"></div>';
	});

	it("returns formatTime that formats date correctly", () => {
		const { result } = renderHook(() => useChatSession(defaultOptions));
		const formatted = result.current.formatTime(
			new Date("2025-01-15T14:30:00Z")
		);
		expect(formatted).toMatch(/\d{1,2}:\d{2}/);
	});

	it("returns initial state", () => {
		const { result } = renderHook(() => useChatSession(defaultOptions));
		expect(result.current.messages).toEqual([]);
		expect(result.current.isLoading).toBe(false);
		expect(result.current.input).toBe("");
		expect(result.current.agentStatus).toBeNull();
		expect(result.current.append).toBeDefined();
	});

	it("handleAgentInputChange updates input", () => {
		const { result } = renderHook(() => useChatSession(defaultOptions));
		act(() => {
			result.current.handleAgentInputChange({
				target: { value: "  hello" },
			} as any);
		});
		expect(result.current.input).toBe("hello");
	});

	describe("interrupt controls", () => {
		it("sends immediately when nothing is in flight", async () => {
			const { result } = renderHook(() => useChatSession(defaultOptions));

			await act(async () => {
				await result.current.append({ role: "user", content: "hello" });
			});

			expect(chatMock.stop).not.toHaveBeenCalled();
			expect(chatMock.sendMessage).toHaveBeenCalledTimes(1);
		});

		it("interrupts the in-flight turn before sending a new message", async () => {
			chatMock.status = "streaming";
			const { result, rerender } = renderHook(() =>
				useChatSession(defaultOptions)
			);

			let pending!: Promise<void>;
			act(() => {
				pending = result.current.append({ role: "user", content: "second" });
			});

			// The previous turn is stopped, and nothing is sent until it settles —
			// this is what stops two streams writing into the same message list.
			expect(chatMock.stop).toHaveBeenCalledTimes(1);
			expect(chatMock.sendMessage).not.toHaveBeenCalled();

			chatMock.status = "ready";
			rerender();
			await act(async () => {
				await pending;
			});

			expect(chatMock.sendMessage).toHaveBeenCalledTimes(1);
		});

		it("tags the partial reply as interrupted when stopped", () => {
			chatMock.status = "streaming";
			chatMock.messages = [
				{ id: "u1", role: "user", content: "hi" },
				{ id: "a1", role: "assistant", content: "partial answer" },
			];
			const { result } = renderHook(() => useChatSession(defaultOptions));

			chatMock.setMessages.mockClear();
			act(() => {
				result.current.stop();
			});

			expect(chatMock.stop).toHaveBeenCalledTimes(1);
			const next = applyLastMessagesUpdate(chatMock.messages);
			expect(next?.at(-1)?.data?.interrupted).toBe(true);
		});

		it("stop is a no-op when no turn is in flight", () => {
			chatMock.status = "ready";
			const { result } = renderHook(() => useChatSession(defaultOptions));

			act(() => {
				result.current.stop();
			});

			expect(chatMock.stop).not.toHaveBeenCalled();
		});

		it("handleContinueGeneration resumes with a hidden prompt", async () => {
			const { result } = renderHook(() => useChatSession(defaultOptions));

			await act(async () => {
				result.current.handleContinueGeneration();
			});

			expect(chatMock.sendMessage).toHaveBeenCalledTimes(1);
			const [{ text }] = chatMock.sendMessage.mock.calls[0] as [
				{ text: string },
			];
			expect(text).toContain("continue your previous response");
			// Hidden from the transcript so "Continue" doesn't look like the user typed it.
			expect(result.current.invisibleUserContentsRef.current.has(text)).toBe(
				true
			);
		});

		it("handleContinueGeneration does nothing while a turn is streaming", () => {
			chatMock.status = "streaming";
			const { result } = renderHook(() => useChatSession(defaultOptions));

			act(() => {
				result.current.handleContinueGeneration();
			});

			expect(chatMock.sendMessage).not.toHaveBeenCalled();
		});
	});
});
