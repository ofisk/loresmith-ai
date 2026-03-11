import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, generateId } from "ai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONTEXT_RECAP_PLACEHOLDER } from "@/app-constants";
import { PLAYER_ROLES } from "@/constants/campaign-roles";
import { NOTIFICATION_TYPES } from "@/constants/notification-types";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import { getCachedHelp, setCachedHelp } from "@/lib/help-cache";
import { getHelpContent } from "@/lib/help-content";
import { createStatusInterceptingFetch } from "@/lib/stream-status-interceptor";
import { API_CONFIG } from "@/shared-config";
import type { campaignTools } from "@/tools/campaign";
import type { fileTools } from "@/tools/file";
import type { generalTools } from "@/tools/general";
import type { Message } from "@/types/ai-message";
import type { Campaign } from "@/types/campaign";

// List of tools that require human confirmation
// NOTE: this should match the keys in the executions object in tools.ts
const toolsRequiringConfirmation: (
	| keyof typeof generalTools
	| keyof typeof campaignTools
	| keyof typeof fileTools
)[] = ["createCampaign", "updateFileMetadata", "deleteFile"];

const CHAT_HISTORY_PAGE_SIZE = 50;

function extractMessageText(msg: Message): string {
	if (typeof msg.content === "string" && msg.content.trim()) return msg.content;
	if (msg.parts?.length) {
		return msg.parts
			.filter((p) => p?.type === "text" && typeof p.text === "string")
			.map((p) => (p as { text: string }).text)
			.join("\n");
	}
	return "";
}

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
	selectedCampaign: Campaign | null;
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
		selectedCampaign,
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
		[conversationId, modalState.showRateLimitReachedModal, addLocalNotification]
	);

	const {
		messages: chatMessages,
		sendMessage,
		setMessages: setChatMessages,
		status: chatStatus,
		stop,
	} = useChat({
		id: conversationId,
		transport: chatTransport,
	});

	const agentMessages = chatMessages as Message[];
	const isLoading = chatStatus === "submitted" || chatStatus === "streaming";
	const setShowAuthModal = modalState.setShowAuthModal;

	const invisibleUserContentsRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		invisibleUserContentsRef.current.add(CONTEXT_RECAP_PLACEHOLDER);
	}, []);

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
		(message: {
			id?: string;
			role: string;
			content: string;
			data?: { [key: string]: unknown };
		}) => {
			const text = (message.content ?? "").trim();
			const baseData = message.data ?? {};
			const enrichedData = { ...baseData, sessionId: conversationId };

			if (message.role === "user") {
				void sendMessage({
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
		[sendMessage, setChatMessages, conversationId]
	);

	const dispatchedCreateCampaignIdsRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		for (const msg of agentMessages) {
			if (msg.role !== "assistant" || !msg.parts) continue;
			for (const part of msg.parts) {
				if (
					part.type === "tool-invocation" &&
					part.toolInvocation?.toolName === "createCampaign" &&
					part.toolInvocation?.state === "result" &&
					part.toolInvocation.toolCallId
				) {
					const id = part.toolInvocation.toolCallId;
					if (!dispatchedCreateCampaignIdsRef.current.has(id)) {
						dispatchedCreateCampaignIdsRef.current.add(id);
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

			const msgs = agentMessages;
			if (msgs.length >= 2) {
				const last = msgs[msgs.length - 1];
				const prev = msgs[msgs.length - 2];
				if (
					last?.role === "assistant" &&
					prev?.role === "user" &&
					(prev?.data as { isHelpRequest?: boolean })?.isHelpRequest === true
				) {
					const text = extractMessageText(last);
					if (text) setCachedHelp("open_help", text);
				}
			}

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
							return [
								...prevList.slice(0, -1),
								{
									...lastPrev,
									data: { ...lastPrev.data, explainability },
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
		agentMessages,
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
			invisibleUserContentsRef.current.add(suggestion);

			append({
				role: "user",
				content: suggestion,
				data: jwt
					? { jwt, campaignId: selectedCampaignId ?? null }
					: { campaignId: selectedCampaignId ?? null },
			});
			setInput("");
			scrollToBottom();
		},
		[authState.getStoredJwt, selectedCampaignId, append, scrollToBottom]
	);

	const handleHelpAction = useCallback(
		(action: string) => {
			if (action === "open_help") {
				const cached = getCachedHelp("open_help");
				if (cached) {
					append({
						role: "assistant",
						content: cached,
						data: authState.getStoredJwt()
							? {
									jwt: authState.getStoredJwt(),
									campaignId: selectedCampaignId ?? null,
								}
							: { campaignId: selectedCampaignId ?? null },
					});
					setInput("");
					return;
				}
				const jwt = authState.getStoredJwt();
				const helpPrompt =
					"I need help with LoreSmith. Please act as a help agent: explain what you can help me with, give example questions I can ask, and share guidance on app functionality and best practices. Base your response on the product documentation and how the app is designed to be used.";
				invisibleUserContentsRef.current.add(helpPrompt);
				append({
					role: "user",
					content: helpPrompt,
					data: jwt
						? {
								jwt,
								campaignId: selectedCampaignId ?? null,
								isHelpRequest: true,
							}
						: {
								campaignId: selectedCampaignId ?? null,
								isHelpRequest: true,
							},
				});
				setInput("");
				return;
			}
			if (action === "usage_limits") {
				modalState.handleUsageLimitsOpen();
				return;
			}
			const jwt = authState.getStoredJwt();
			const response = getHelpContent(action);
			append({
				role: "assistant",
				content: response,
				data: jwt
					? { jwt, campaignId: selectedCampaignId ?? null }
					: { campaignId: selectedCampaignId ?? null },
			});
			setInput("");
		},
		[
			append,
			authState.getStoredJwt,
			selectedCampaignId,
			modalState.handleUsageLimitsOpen,
		]
	);

	const handleSessionRecapRequest = useCallback(async () => {
		if (!selectedCampaignId) return;
		try {
			const jwt = authState.getStoredJwt();
			if (!jwt) return;

			const recapMessage =
				"I want to record a session recap. Can you guide me through creating a session digest?";
			invisibleUserContentsRef.current.add(recapMessage);

			await append({
				id: generateId(),
				role: "user",
				content: recapMessage,
				data: {
					jwt: jwt,
					campaignId: selectedCampaignId,
				},
			});
		} catch (error) {
			console.error("Error requesting session recap:", error);
		}
	}, [append, authState.getStoredJwt, selectedCampaignId]);

	const handleNextStepsRequest = useCallback(async () => {
		if (!selectedCampaignId) return;
		try {
			const jwt = authState.getStoredJwt();
			if (!jwt) return;

			const role = selectedCampaign?.role ?? null;
			const isPlayerRole = role !== null && PLAYER_ROLES.has(role as never);

			const nextStepsMessage = isPlayerRole
				? "What should I do next with my character and at the table?"
				: "What should I do next for this campaign?";
			invisibleUserContentsRef.current.add(nextStepsMessage);

			await append({
				id: generateId(),
				role: "user",
				content: nextStepsMessage,
				data: {
					jwt: jwt,
					campaignId: selectedCampaignId,
				},
			});
		} catch (error) {
			console.error("Error requesting next steps:", error);
		}
	}, [append, authState.getStoredJwt, selectedCampaignId, selectedCampaign]);

	const pendingToolCallConfirmation = agentMessages.some((m: Message) =>
		m.parts?.some(
			(part) =>
				part.type === "tool-invocation" &&
				part.toolInvocation?.state === "call" &&
				toolsRequiringConfirmation.includes(
					(part.toolInvocation?.toolName ?? "") as
						| keyof typeof generalTools
						| keyof typeof campaignTools
						| keyof typeof fileTools
				)
		)
	);

	const formatTime = useCallback((date: Date) => {
		return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	}, []);

	const handleFormSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			if (!(agentInput ?? "").trim()) return;

			updateActivity();

			const jwt = authState.getStoredJwt();

			append({
				role: "user",
				content: agentInput ?? "",
				data: jwt
					? { jwt, campaignId: selectedCampaignId ?? null }
					: { campaignId: selectedCampaignId ?? null },
			});
			setInput("");
			setTextareaHeight("auto");
			scrollToBottom();
		},
		[
			agentInput,
			updateActivity,
			authState.getStoredJwt,
			selectedCampaignId,
			append,
			setTextareaHeight,
			scrollToBottom,
		]
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
				e.preventDefault();
				if (!(agentInput ?? "").trim()) return;

				const jwt = authState.getStoredJwt();

				append({
					role: "user",
					content: agentInput ?? "",
					data: jwt
						? { jwt, campaignId: selectedCampaignId ?? null }
						: { campaignId: selectedCampaignId ?? null },
				});
				setInput("");
				setTextareaHeight("auto");
				scrollToBottom();
			}
		},
		[
			agentInput,
			authState.getStoredJwt,
			selectedCampaignId,
			append,
			setTextareaHeight,
			scrollToBottom,
		]
	);

	return {
		messages: agentMessages,
		isLoading,
		agentStatus,
		input: agentInput,
		handleAgentInputChange,
		handleFormSubmit,
		handleKeyDown,
		handleSuggestionSubmit,
		handleHelpAction,
		handleSessionRecapRequest,
		handleNextStepsRequest,
		stop,
		pendingToolCallConfirmation,
		formatTime,
		chatHistoryLoaded,
		invisibleUserContentsRef,
		append,
	};
}
