import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, generateId } from "ai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	CONTEXT_RECAP_PLACEHOLDER,
	UI_INITIATED_PROMPTS,
} from "@/app-constants";
import { NOTIFICATION_TYPES } from "@/constants/notification-types";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import { createStatusInterceptingFetch } from "@/lib/stream-status-interceptor";
import {
	getToolPartInfo,
	isComplete,
	isPendingConfirmation,
	isToolPart,
} from "@/lib/tool-part-utils";
import { API_CONFIG } from "@/shared-config";
import type { campaignTools } from "@/tools/campaign";
import type { fileTools } from "@/tools/file";
import type { generalTools } from "@/tools/general";
import type { Message } from "@/types/ai-message";

// List of tools that require human confirmation
// NOTE: this should match the keys in the executions object in tools.ts
const toolsRequiringConfirmation: (
	| keyof typeof generalTools
	| keyof typeof campaignTools
	| keyof typeof fileTools
)[] = ["createCampaign", "updateFileMetadata", "deleteFile"];

const CHAT_HISTORY_PAGE_SIZE = 50;

/**
 * How long to wait for an interrupted turn to unwind before sending the next
 * one. `stop()` resolves as soon as it calls `abort()`, not when the stream has
 * actually torn down, so we wait for the hook's own status to go idle. The
 * server-side supersede guard covers us if this ever times out.
 */
const INTERRUPT_SETTLE_TIMEOUT_MS = 2000;
const INTERRUPT_SETTLE_POLL_MS = 25;

/** Hidden prompt used by "Continue" to resume an interrupted response. */
const CONTINUE_GENERATION_PROMPT =
	"Please continue your previous response from where it was interrupted. Do not repeat what you already said.";

interface ChatHistoryResponse {
	messages?: Message[];
	pagination?: {
		limit?: number;
		offset?: number;
		returned?: number;
		hasMore?: boolean;
		nextOffset?: number;
	};
}

export interface UseChatSessionOptions {
	conversationId: string;
	authState: {
		getStoredJwt: () => string | null;
	};
	modalState: {
		setShowAuthModal: (show: boolean) => void;
		showRateLimitReachedModal: (
			reason?: string,
			nextResetAt?: string | null
		) => void;
		handleUsageLimitsOpen: () => void;
	};
	selectedCampaignId: string | null;
	chatContainerId: string;
	setTextareaHeight: (height: string) => void;
	addLocalNotification: (type: string, title: string, message?: string) => void;
	updateActivity: () => void;
	authReady: boolean;
}

export function useChatSession(options: UseChatSessionOptions) {
	const {
		conversationId,
		authState,
		modalState,
		selectedCampaignId,
		chatContainerId,
		setTextareaHeight,
		addLocalNotification,
		updateActivity,
		authReady,
	} = options;

	const [agentStatus, setAgentStatus] = useState<string | null>(null);
	const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);
	const [chatHistoryOffset, setChatHistoryOffset] = useState(0);
	const [hasMoreHistory, setHasMoreHistory] = useState(false);
	const isLoadingOlderHistoryRef = useRef(false);
	const hasAutoScrolledInitialHistoryRef = useRef(false);
	const [agentInput, setInput] = useState("");

	const chatAuthRef = useRef<{
		jwt: string | null;
		campaignId: string | null;
	}>({ jwt: null, campaignId: null });
	chatAuthRef.current = {
		jwt: authState.getStoredJwt() ?? null,
		campaignId: selectedCampaignId ?? null,
	};

	const chatTransport = useMemo(
		() =>
			new DefaultChatTransport({
				api: `${API_CONFIG.getApiBaseUrl()}/agents/chat/${conversationId}`,
				fetch: createStatusInterceptingFetch(
					fetch,
					(msg) => setAgentStatus(msg),
					{
						onRateLimitExceeded: (params) => {
							modalState.showRateLimitReachedModal(
								params.error,
								params.nextResetAt ?? undefined
							);
							addLocalNotification(
								NOTIFICATION_TYPES.ERROR,
								"Rate limit reached",
								params.nextResetAt
									? `${params.error} Next reset: ${new Date(params.nextResetAt).toLocaleString()}.`
									: params.error
							);
						},
						onUnauthorized: () => modalState.setShowAuthModal(true),
					}
				),
				headers: () => ({
					Authorization: `Bearer ${chatAuthRef.current.jwt ?? ""}`,
				}),
				body: () => ({
					data: {
						jwt: chatAuthRef.current.jwt ?? undefined,
						campaignId: chatAuthRef.current.campaignId ?? null,
					},
				}),
				prepareSendMessagesRequest: async (transportOptions) => {
					const messages = transportOptions.messages ?? [];
					const lastUser = [...messages]
						.reverse()
						.find((m) => m.role === "user");
					const lastId =
						lastUser && "id" in lastUser && typeof lastUser.id === "string"
							? lastUser.id
							: undefined;
					const finalMessages =
						lastId && transportOptions.trigger === "submit-message"
							? [
									...messages,
									{
										role: "system",
										content: "",
										data: {
											type: "client_marker",
											processedMessageId: lastId,
											campaignId: chatAuthRef.current.campaignId ?? null,
										},
									},
								]
							: messages;
					return {
						body: {
							...transportOptions.body,
							id: transportOptions.id,
							messages: finalMessages,
							trigger: transportOptions.trigger,
							messageId: transportOptions.messageId,
						},
					};
				},
			}),
		[
			conversationId,
			modalState.showRateLimitReachedModal,
			modalState.setShowAuthModal,
			addLocalNotification,
		]
	);

	const {
		messages: chatMessages,
		sendMessage,
		setMessages: setChatMessages,
		status: chatStatus,
		stop,
		error: chatError,
		regenerate,
	} = useChat({
		id: conversationId,
		transport: chatTransport,
		onError: (_err) => {
			// Error is surfaced via useChat's error and shown in UI; optionally log/analytics here
		},
	});

	const agentMessages = chatMessages as Message[];
	const isLoading = chatStatus === "submitted" || chatStatus === "streaming";
	const setShowAuthModal = modalState.setShowAuthModal;

	// Read during callbacks that must not re-create themselves on every status
	// change. Assigned in the render body so it tracks the committed status.
	const isLoadingRef = useRef(isLoading);
	isLoadingRef.current = isLoading;

	/**
	 * Tag the in-flight assistant message as interrupted so the pane can show a
	 * "Stopped" badge and a Continue action. The server persists the same flag on
	 * the partial message, so the state survives a reload.
	 */
	const markLastAssistantInterrupted = useCallback(() => {
		setChatMessages((prev) => {
			const list = prev as Message[];
			const lastIndex = list.length - 1;
			const last = list[lastIndex];
			if (!last || last.role !== "assistant") return prev;
			if ((last.data as { interrupted?: boolean } | undefined)?.interrupted)
				return prev;
			return [
				...list.slice(0, lastIndex),
				{ ...last, data: { ...last.data, interrupted: true } },
			] as typeof prev;
		});
	}, [setChatMessages]);

	/** Stop the current turn. Safe to call when nothing is streaming. */
	const handleStop = useCallback(() => {
		if (!isLoadingRef.current) return;
		void stop();
		markLastAssistantInterrupted();
		setAgentStatus(null);
	}, [stop, markLastAssistantInterrupted]);

	/**
	 * Interrupt the in-flight turn and wait for it to settle.
	 *
	 * Sending a second message while one is streaming used to start a concurrent
	 * request: the AI SDK overwrites its `activeResponse`, so both streams write
	 * into the same message list and the pane fills with interleaved output.
	 * A new message now always supersedes the turn before it.
	 */
	const interruptActiveTurn = useCallback(async () => {
		if (!isLoadingRef.current) return;
		handleStop();

		const deadline = Date.now() + INTERRUPT_SETTLE_TIMEOUT_MS;
		while (isLoadingRef.current && Date.now() < deadline) {
			await new Promise((resolve) =>
				setTimeout(resolve, INTERRUPT_SETTLE_POLL_MS)
			);
		}
	}, [handleStop]);

	const invisibleUserContentsRef = useRef<Set<string>>(new Set());
	const [invisibleUserContentsVersion, setInvisibleUserContentsVersion] =
		useState(0);
	const addToInvisible = useCallback((text: string) => {
		invisibleUserContentsRef.current.add(text);
		setInvisibleUserContentsVersion((v) => v + 1);
	}, []);
	useEffect(() => {
		addToInvisible(CONTEXT_RECAP_PLACEHOLDER);
	}, [addToInvisible]);

	const fetchChatHistoryPage = useCallback(
		async (
			sessionId: string,
			jwt: string,
			offset: number,
			limit: number
		): Promise<ChatHistoryResponse> => {
			const endpoint = API_CONFIG.ENDPOINTS.CHAT.HISTORY(sessionId);
			const url = new URL(API_CONFIG.buildUrl(endpoint));
			url.searchParams.set("limit", String(limit));
			url.searchParams.set("offset", String(offset));

			const response = await fetch(url.toString(), {
				headers: { Authorization: `Bearer ${jwt}` },
			});
			if (response.status === 401) {
				setShowAuthModal(true);
				return { messages: [] };
			}
			if (!response.ok) return { messages: [] };
			return (await response
				.json()
				.catch(() => ({ messages: [] }))) as ChatHistoryResponse;
		},
		[setShowAuthModal]
	);

	const append = useCallback(
		async (message: {
			id?: string;
			role: string;
			content: string;
			data?: { [key: string]: unknown };
		}) => {
			const text = (message.content ?? "").trim();
			const baseData = message.data ?? {};
			const enrichedData = { ...baseData, sessionId: conversationId };

			if (message.role === "user") {
				// Every user-message path (typing, suggestions, help, recap, next
				// steps, "Work on this") funnels through here, so this is the one
				// place that has to guarantee a single in-flight turn.
				await interruptActiveTurn();
				await sendMessage({
					text: text || " ",
					metadata: enrichedData,
				});
			} else {
				const newMsg = {
					id: message.id ?? generateId(),
					role: message.role as "user" | "assistant" | "system",
					content: text,
					parts: text ? [{ type: "text" as const, text }] : [],
					data: enrichedData,
				};
				setChatMessages((prev) => [...prev, newMsg] as typeof prev);
			}
		},
		[sendMessage, setChatMessages, conversationId, interruptActiveTurn]
	);

	const dispatchedCreateCampaignIdsRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		for (const msg of agentMessages) {
			if (msg.role !== "assistant" || !msg.parts) continue;
			for (const part of msg.parts) {
				if (!isToolPart(part)) continue;
				const info = getToolPartInfo(part);
				if (
					info &&
					info.toolName === "createCampaign" &&
					isComplete(info.state) &&
					info.toolCallId
				) {
					if (!dispatchedCreateCampaignIdsRef.current.has(info.toolCallId)) {
						dispatchedCreateCampaignIdsRef.current.add(info.toolCallId);
						window.dispatchEvent(
							new CustomEvent(APP_EVENT_TYPE.CAMPAIGN_CREATED, {
								detail: {},
							})
						);
					}
				}
			}
		}
	}, [agentMessages]);

	const prevChatStatusRef = useRef(chatStatus);
	useEffect(() => {
		const wasStreaming = prevChatStatusRef.current === "streaming";
		prevChatStatusRef.current = chatStatus;

		if (wasStreaming && chatStatus === "ready") {
			setAgentStatus(null);

			const jwt = authState.getStoredJwt();
			if (jwt && authReady) {
				const url = API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CHAT.HISTORY(conversationId)
				);
				fetch(url, { headers: { Authorization: `Bearer ${jwt}` } })
					.then((res) =>
						res.ok
							? (res.json() as Promise<{ messages?: Message[] }>)
							: { messages: [] }
					)
					.then((data) => {
						const serverMessages = data?.messages ?? [];
						const lastServer = serverMessages[serverMessages.length - 1];
						if (
							lastServer?.role !== "assistant" ||
							!lastServer.data?.explainability
						)
							return;

						setChatMessages((prev) => {
							const prevList = prev as Message[];
							const lastPrev = prevList[prevList.length - 1];
							const explainability = lastServer?.data?.explainability;
							if (
								!explainability ||
								lastPrev?.role !== "assistant" ||
								lastPrev.data?.explainability
							)
								return prev;
							// campaignId rides along: the sources panel needs it to open a
							// cited entity and to attribute a context-accuracy rating.
							const campaignId = lastServer?.data?.campaignId;
							return [
								...prevList.slice(0, -1),
								{
									...lastPrev,
									data: { ...lastPrev.data, campaignId, explainability },
								},
							] as typeof prev;
						});
					})
					.catch(() => {});
			}
		}
	}, [
		chatStatus,
		conversationId,
		authReady,
		authState.getStoredJwt,
		setChatMessages,
	]);

	useEffect(() => {
		if (!authReady) return;

		setChatMessages([]);
		setChatHistoryLoaded(false);
		setChatHistoryOffset(0);
		setHasMoreHistory(false);
		isLoadingOlderHistoryRef.current = false;

		const jwt = authState.getStoredJwt();
		if (!jwt || conversationId === "auth-required") {
			setChatHistoryLoaded(true);
			setShowAuthModal(true);
			return;
		}

		let cancelled = false;
		void fetchChatHistoryPage(conversationId, jwt, 0, CHAT_HISTORY_PAGE_SIZE)
			.then((data) => {
				if (cancelled) return;
				const messages = data?.messages ?? [];
				const hasMore =
					typeof data?.pagination?.hasMore === "boolean"
						? data.pagination.hasMore
						: messages.length === CHAT_HISTORY_PAGE_SIZE;
				setChatMessages((_prev) => messages as typeof _prev);
				setChatHistoryOffset(messages.length);
				setHasMoreHistory(hasMore);
			})
			.catch(() => {
				if (cancelled) return;
				setChatMessages((_prev) => [] as typeof _prev);
				setChatHistoryOffset(0);
				setHasMoreHistory(false);
			})
			.finally(() => {
				if (!cancelled) setChatHistoryLoaded(true);
			});
		return () => {
			cancelled = true;
		};
	}, [
		authReady,
		conversationId,
		setChatMessages,
		authState.getStoredJwt,
		setShowAuthModal,
		fetchChatHistoryPage,
	]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset scroll flag when switching conversations
	useEffect(() => {
		hasAutoScrolledInitialHistoryRef.current = false;
	}, [conversationId]);

	useEffect(() => {
		if (!chatHistoryLoaded || hasAutoScrolledInitialHistoryRef.current) return;
		const chatContainer = document.getElementById(chatContainerId);
		if (!chatContainer) return;

		hasAutoScrolledInitialHistoryRef.current = true;
		const scrollToBottom = () => {
			chatContainer.scrollTop = chatContainer.scrollHeight;
		};
		requestAnimationFrame(() => {
			requestAnimationFrame(scrollToBottom);
		});
		const t1 = setTimeout(scrollToBottom, 100);
		const t2 = setTimeout(scrollToBottom, 300);
		return () => {
			clearTimeout(t1);
			clearTimeout(t2);
		};
	}, [chatHistoryLoaded, chatContainerId]);

	useEffect(() => {
		if (!chatHistoryLoaded || !hasMoreHistory) return;
		const chatContainer = document.getElementById(chatContainerId);
		if (!chatContainer) return;

		const handleScroll = () => {
			if (chatContainer.scrollTop > 80) return;
			if (isLoadingOlderHistoryRef.current) return;

			const jwt = authState.getStoredJwt();
			if (!jwt || conversationId === "auth-required") return;

			isLoadingOlderHistoryRef.current = true;
			const previousScrollHeight = chatContainer.scrollHeight;
			const previousScrollTop = chatContainer.scrollTop;

			void fetchChatHistoryPage(
				conversationId,
				jwt,
				chatHistoryOffset,
				CHAT_HISTORY_PAGE_SIZE
			)
				.then((data) => {
					const olderMessages = data?.messages ?? [];
					if (olderMessages.length > 0) {
						setChatMessages(
							(prev) =>
								[...olderMessages, ...(prev as Message[])] as typeof prev
						);
						setChatHistoryOffset((prev) => prev + olderMessages.length);
					}

					const hasMore =
						typeof data?.pagination?.hasMore === "boolean"
							? data.pagination.hasMore
							: olderMessages.length === CHAT_HISTORY_PAGE_SIZE;
					setHasMoreHistory(hasMore);

					requestAnimationFrame(() => {
						const newScrollHeight = chatContainer.scrollHeight;
						chatContainer.scrollTop =
							newScrollHeight - previousScrollHeight + previousScrollTop;
					});
				})
				.catch(() => {})
				.finally(() => {
					isLoadingOlderHistoryRef.current = false;
				});
		};

		chatContainer.addEventListener("scroll", handleScroll, { passive: true });
		return () => {
			chatContainer.removeEventListener("scroll", handleScroll);
		};
	}, [
		chatHistoryLoaded,
		hasMoreHistory,
		chatContainerId,
		authState.getStoredJwt,
		conversationId,
		chatHistoryOffset,
		fetchChatHistoryPage,
		setChatMessages,
	]);

	const scrollToBottom = useCallback(() => {
		setTimeout(() => {
			const chatContainer = document.getElementById(chatContainerId);
			if (chatContainer) {
				chatContainer.scrollTo({
					top: chatContainer.scrollHeight,
					behavior: "smooth",
				});
			}
		}, 100);
	}, [chatContainerId]);

	const handleAgentInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setInput((e?.target?.value ?? "").trimStart());
		},
		[]
	);

	const handleSuggestionSubmit = useCallback(
		(suggestion: string) => {
			const jwt = authState.getStoredJwt();
			addToInvisible(suggestion);

			void append({
				role: "user",
				content: suggestion,
				data: jwt
					? { jwt, campaignId: selectedCampaignId ?? null }
					: { campaignId: selectedCampaignId ?? null },
			});
			setInput("");
			scrollToBottom();
		},
		[
			authState.getStoredJwt,
			selectedCampaignId,
			append,
			scrollToBottom,
			addToInvisible,
		]
	);

	const handleSessionRecapRequest = useCallback(async () => {
		if (!selectedCampaignId) return;
		try {
			const jwt = authState.getStoredJwt();
			if (!jwt) return;

			const recapMessage = UI_INITIATED_PROMPTS.SESSION_RECAP;
			addToInvisible(recapMessage);

			await append({
				id: generateId(),
				role: "user",
				content: recapMessage,
				data: {
					jwt: jwt,
					campaignId: selectedCampaignId,
					agentType: "session-digest",
				},
			});
		} catch (_error) {}
	}, [append, authState.getStoredJwt, selectedCampaignId, addToInvisible]);

	const pendingToolCallConfirmation = agentMessages.some((m: Message) =>
		m.parts?.some((part) => {
			if (!isToolPart(part)) return false;
			const info = getToolPartInfo(part);
			return (
				info &&
				isPendingConfirmation(info.state) &&
				toolsRequiringConfirmation.includes(
					info.toolName as
						| keyof typeof generalTools
						| keyof typeof campaignTools
						| keyof typeof fileTools
				)
			);
		})
	);

	const formatTime = useCallback((date: Date) => {
		return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	}, []);

	const submitAgentMessage = useCallback(() => {
		if (!(agentInput ?? "").trim()) return;

		updateActivity();

		const jwt = authState.getStoredJwt();

		// `append` interrupts any in-flight turn first, so the input can be cleared
		// immediately — the message is already captured.
		void append({
			role: "user",
			content: agentInput ?? "",
			data: jwt
				? { jwt, campaignId: selectedCampaignId ?? null }
				: { campaignId: selectedCampaignId ?? null },
		});
		setInput("");
		setTextareaHeight("auto");
		scrollToBottom();
	}, [
		agentInput,
		updateActivity,
		authState.getStoredJwt,
		selectedCampaignId,
		append,
		setTextareaHeight,
		scrollToBottom,
	]);

	const handleFormSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			submitAgentMessage();
		},
		[submitAgentMessage]
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
				e.preventDefault();
				submitAgentMessage();
			}
		},
		[submitAgentMessage]
	);

	/**
	 * Resume an interrupted response. The model still has its own partial text in
	 * context, so it picks up where it stopped rather than starting over. The
	 * prompt itself is hidden from the transcript.
	 */
	const handleContinueGeneration = useCallback(() => {
		if (isLoadingRef.current) return;
		const jwt = authState.getStoredJwt();
		addToInvisible(CONTINUE_GENERATION_PROMPT);
		void append({
			role: "user",
			content: CONTINUE_GENERATION_PROMPT,
			data: jwt
				? { jwt, campaignId: selectedCampaignId ?? null }
				: { campaignId: selectedCampaignId ?? null },
		});
		scrollToBottom();
	}, [
		append,
		authState.getStoredJwt,
		selectedCampaignId,
		addToInvisible,
		scrollToBottom,
	]);

	return {
		messages: agentMessages,
		isLoading,
		agentStatus,
		input: agentInput,
		handleAgentInputChange,
		handleFormSubmit,
		handleKeyDown,
		handleSuggestionSubmit,
		handleSessionRecapRequest,
		stop: handleStop,
		handleContinueGeneration,
		pendingToolCallConfirmation,
		formatTime,
		chatHistoryLoaded,
		invisibleUserContentsRef,
		invisibleUserContentsVersion,
		addToInvisible,
		append,
		error: chatError,
		regenerate,
	};
}
