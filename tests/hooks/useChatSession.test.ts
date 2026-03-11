// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatSession } from "@/hooks/useChatSession";

vi.mock("@ai-sdk/react", () => ({
	useChat: vi.fn(() => ({
		messages: [],
		sendMessage: vi.fn(),
		setMessages: vi.fn(),
		status: "ready",
		stop: vi.fn(),
	})),
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

describe("useChatSession", () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
});
