import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, generateId } from "ai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Joyride from "react-joyride";
import { CONTEXT_RECAP_PLACEHOLDER } from "@/app-constants";
import { AppHeader } from "@/components/app/AppHeader";
import { AppModals } from "@/components/app/AppModals";
import { ChatArea } from "@/components/app/ChatArea";
import { JoinCampaignPage } from "@/components/join/JoinCampaignPage";
import { ResourceSidePanel } from "@/components/resource-side-panel";
import { ShardOverlay } from "@/components/shard/ShardOverlay";
import { CAMPAIGN_ROLES, PLAYER_ROLES } from "@/constants/campaign-roles";
// Component imports
import { NOTIFICATION_TYPES } from "@/constants/notification-types";
import type { FileMetadata } from "@/dao";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import { useAppAuthentication } from "@/hooks/useAppAuthentication";
import { useAppEventHandlers } from "@/hooks/useAppEventHandlers";
import { useAppState } from "@/hooks/useAppState";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useCampaignAddition } from "@/hooks/useCampaignAddition";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useGlobalShardManager } from "@/hooks/useGlobalShardManager";
import { useLocalNotifications } from "@/hooks/useLocalNotifications";
import { useModalState } from "@/hooks/useModalState";
import { useUiHints } from "@/hooks/useUiHints";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import { getHelpContent } from "@/lib/help-content";
import { createStatusInterceptingFetch } from "@/lib/stream-status-interceptor";
import { AuthService } from "@/services/core/auth-service";
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
)[] = [
	// Campaign tools that require confirmation
	"createCampaign",

	// Resource tools that require confirmation
	"updateFileMetadata",
	"deleteFile",
];

export default function Chat() {
	// Tour state
	const [runTour, setRunTour] = useState(false);
	const [stepIndex, setStepIndex] = useState(0);

	// Check if tour was completed on mount
	const tourCompleted =
		localStorage.getItem("loresmith-tour-completed") === "true";

	const handleJoyrideCallback = (data: any) => {
		const { action, index, status, type, lifecycle } = data;

		// Save current step to local storage
		if (type === "step:after" || type === "step:before") {
			localStorage.setItem("loresmith-tour-step", String(index));
		}

		// Close tour on escape or skip
		if (
			action === "close" ||
			action === "skip" ||
			status === "finished" ||
			status === "skipped"
		) {
			setRunTour(false);
			// Mark tour as completed
			localStorage.setItem("loresmith-tour-completed", "true");
			localStorage.removeItem("loresmith-tour-step"); // Clear saved step
			return;
		}

		// When a step's target isn't in the DOM, skip to the next step so the overlay doesn't block the page
		if (lifecycle === "tooltip" && type === "error:target_not_found") {
			console.log("Target not found, skipping step:", index);
			const stepsCount = 12;
			if (index + 1 >= stepsCount) {
				setRunTour(false);
				localStorage.setItem("loresmith-tour-completed", "true");
			} else {
				setStepIndex(index + 1);
			}
			return;
		}

		// Handle step changes
		if (type === "step:after" || type === "target:before") {
			setStepIndex(index + (action === "prev" ? -1 : 1));
		}
	};

	// Add keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!runTour) return;

			if (e.key === "ArrowRight") {
				e.preventDefault();
				// Simulate next button click
				const nextButton = document.querySelector(
					'[data-action="primary"]'
				) as HTMLButtonElement;
				if (nextButton) nextButton.click();
			} else if (e.key === "ArrowLeft") {
				e.preventDefault();
				// Simulate back button click
				const backButton = document.querySelector(
					'[data-action="back"]'
				) as HTMLButtonElement;
				if (backButton) backButton.click();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [runTour]);

	// Modal state must be created first so it can be shared
	const modalState = useModalState();
	const authState = useAppAuthentication();

	// On load, if URL hash contains #token=... or #google_pending=... (e.g. after Google OAuth redirect), handle it and clear hash
	useEffect(() => {
		if (typeof window === "undefined") return;
		const hash = window.location.hash?.replace(/^#/, "") || "";
		const params = new URLSearchParams(hash);
		const token = params.get("token");
		const googlePending = params.get("google_pending");
		if (token && authState.acceptToken) {
			authState.acceptToken(token).then(() => {
				window.history.replaceState(
					null,
					"",
					window.location.pathname + window.location.search
				);
				modalState.setShowAuthModal(false);
			});
		} else if (googlePending) {
			modalState.setGooglePendingToken(googlePending);
			modalState.setShowAuthModal(true);
			window.history.replaceState(
				null,
				"",
				window.location.pathname + window.location.search
			);
		}
	}, [
		authState.acceptToken,
		modalState.setGooglePendingToken,
		modalState.setShowAuthModal,
	]);

	// Start tour after authentication (only if not completed)
	useEffect(() => {
		console.log(
			"[Tour] Effect running - Auth:",
			authState.isAuthenticated,
			"JWT:",
			!!authState.getStoredJwt(),
			"Completed:",
			tourCompleted
		);

		if (authState.isAuthenticated && !tourCompleted) {
			console.log("[Tour] Authenticated, starting tour after delay");

			// Check if there's a saved step to resume from
			const savedStep = localStorage.getItem("loresmith-tour-step");
			const resumeStep = savedStep ? parseInt(savedStep, 10) : 0;

			const timer = setTimeout(() => {
				console.log("[Tour] Starting tour now at step:", resumeStep);
				setStepIndex(resumeStep);
				setRunTour(true);
			}, 300); // 300ms delay
			return () => clearTimeout(timer);
		} else if (tourCompleted) {
			console.log("[Tour] Tour already completed, skipping");
		} else {
			console.log("[Tour] Not authenticated yet");
		}
	}, [authState.isAuthenticated, tourCompleted, authState.getStoredJwt]);

	// Debug: Add global function to manually start tour
	useEffect(() => {
		(window as any).startTour = () => {
			console.log("[Tour] Manually starting tour");
			localStorage.removeItem("loresmith-tour-completed");
			localStorage.removeItem("loresmith-tour-step");
			setStepIndex(0);
			setRunTour(true);
		};
	}, []);

	// Consolidated app state - pass modalState and authState so they use the same instances
	// IMPORTANT: authState must be passed to prevent duplicate authentication hook instances
	// which would cause the UI to lose authentication state on page refresh
	const {
		chatContainerId,
		textareaHeight,
		setTextareaHeight,
		triggerFileUpload,
		setTriggerFileUpload,
	} = useAppState({ modalState, authState });

	const {
		createCampaign,
		campaigns,
		selectedCampaignId,
		selectedCampaign,
		setSelectedCampaignId,
		refetch: refetchCampaigns,
	} = useCampaigns();

	const username = AuthService.getJwtPayload()?.username ?? null;
	const conversationId =
		username !== null
			? `${username}-campaign-${selectedCampaignId ?? "none"}`
			: "auth-required";

	// Join page: /join?token=xxx
	const [joinComplete, setJoinComplete] = useState(false);
	const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
	const joinToken =
		typeof window !== "undefined" &&
		window.location.pathname === "/join" &&
		!joinComplete
			? new URLSearchParams(window.location.search).get("token")
			: null;

	const handleJoinSuccess = useCallback(
		(campaignId: string) => {
			window.history.replaceState(null, "", "/");
			setSelectedCampaignId(campaignId);
			refetchCampaigns();
			setJoinComplete(true);
		},
		[setSelectedCampaignId, refetchCampaigns]
	);

	useEffect(() => {
		const handleResize = () => {
			if (window.innerWidth >= 768) {
				setIsMobileSidebarOpen(false);
			}
		};
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);
	const {
		allNotifications,
		addLocalNotification,
		dismissNotification,
		clearAllNotifications,
	} = useLocalNotifications();
	const proposalConfirmResolveRef = useRef<((value: boolean) => void) | null>(
		null
	);
	const getProposalConfirmation = useCallback(
		(legalNotice: string) => {
			modalState.showProposalConfirmModal(legalNotice);
			return new Promise<boolean>((resolve) => {
				proposalConfirmResolveRef.current = resolve;
			});
		},
		[modalState]
	);
	const onProposalConfirm = useCallback(() => {
		proposalConfirmResolveRef.current?.(true);
		proposalConfirmResolveRef.current = null;
		modalState.hideProposalConfirmModal();
	}, [modalState]);
	const onProposalCancel = useCallback(() => {
		proposalConfirmResolveRef.current?.(false);
		proposalConfirmResolveRef.current = null;
		modalState.hideProposalConfirmModal();
	}, [modalState]);
	const { campaignAdditionProgress, isAddingToCampaigns, addFileToCampaigns } =
		useCampaignAddition(getProposalConfirmation);

	// Activity tracking for recap triggers
	const {
		checkShouldShowRecap,
		markRecapShown,
		checkHasBeenAway,
		updateActivity,
	} = useActivityTracking();

	// File upload hook
	const { handleUpload } = useFileUpload({
		onUploadSuccess: (filename, fileKey) => {
			console.log("Upload successful:", filename, fileKey);
			updateActivity(); // Update activity timestamp on file upload
			addLocalNotification(
				NOTIFICATION_TYPES.SUCCESS,
				"File uploaded",
				`"${filename}" has been uploaded and we're preparing it for your campaigns.`
			);
		},
		onUploadStart: () => {
			console.log("Upload started");
		},
	});

	// Handle file upload trigger callback
	const handleFileUploadTriggered = useCallback(() => {
		setTriggerFileUpload(false);
	}, [setTriggerFileUpload]);

	const handleFileUpdate = useCallback(
		async (updatedFile: FileMetadata) => {
			// File metadata update is handled by EditFileModal component
			// This callback is triggered after successful update to provide feedback
			console.log("[app] File updated:", updatedFile);

			// Dispatch event to update the file list in real-time
			if (typeof window !== "undefined") {
				window.dispatchEvent(
					new CustomEvent(APP_EVENT_TYPE.FILE_STATUS_UPDATED, {
						detail: {
							completeFileData: updatedFile,
							fileKey: updatedFile.file_key,
						},
					})
				);
				console.log(
					"[app] Dispatched file-status-updated event for:",
					updatedFile.file_key
				);
			}

			addLocalNotification(
				NOTIFICATION_TYPES.SUCCESS,
				"File Updated",
				`"${updatedFile.file_name}" has been updated successfully.`
			);
			modalState.handleEditFileClose();
		},
		[modalState, addLocalNotification]
	);

	const handleLogout = useCallback(async () => {
		try {
			await authState.handleLogout();
			modalState.setShowAuthModal(true);
		} catch (error) {
			console.error("Logout error:", error);
			modalState.setShowAuthModal(true);
		}
	}, [authState, modalState]);

	// Ref to supply fresh jwt/campaignId to the chat transport on each request
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
				prepareSendMessagesRequest: async (options) => {
					const messages = options.messages ?? [];
					const lastUser = [...messages]
						.reverse()
						.find((m) => m.role === "user");
					const lastId =
						lastUser && "id" in lastUser && typeof lastUser.id === "string"
							? lastUser.id
							: undefined;
					const finalMessages =
						lastId && options.trigger === "submit-message"
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
							...options.body,
							id: options.id,
							messages: finalMessages,
							trigger: options.trigger,
							messageId: options.messageId,
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

	const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);
	const [agentStatus, setAgentStatus] = useState<string | null>(null);

	const [agentInput, setInput] = useState("");
	const handleAgentInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setInput((e?.target?.value ?? "").trimStart());
		},
		[]
	);

	const agentMessages = chatMessages as Message[];
	const isLoading = chatStatus === "submitted" || chatStatus === "streaming";

	// Tracks user message contents to hide in the UI (button-triggered prompts); never cleared so they stay hidden
	const invisibleUserContentsRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		invisibleUserContentsRef.current.add(CONTEXT_RECAP_PLACEHOLDER);
	}, []);

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

	const authReady = useAuthReady();

	// On stream end: clear agent status and refetch history to get explainability
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
	]);

	// Restore chat history from API; when conversationId changes, clear and load that conversation's history.
	// Unauthenticated users are routed to the auth flow (no shared anon key to avoid data leaks).
	// Fault tolerant: new conversationId format may return empty; treat errors as empty messages.
	const setShowAuthModal = modalState.setShowAuthModal;
	useEffect(() => {
		if (!authReady) return;

		setChatMessages([]);
		setChatHistoryLoaded(false);

		const jwt = authState.getStoredJwt();
		if (!jwt || conversationId === "auth-required") {
			setChatHistoryLoaded(true);
			setShowAuthModal(true);
			return;
		}

		let cancelled = false;
		const url = API_CONFIG.buildUrl(
			API_CONFIG.ENDPOINTS.CHAT.HISTORY(conversationId)
		);
		fetch(url, {
			headers: { Authorization: `Bearer ${jwt}` },
		})
			.then((res) => {
				if (res.status === 401) {
					setShowAuthModal(true);
					return { messages: [] };
				}
				if (!res.ok) return { messages: [] };
				return res.json().catch(() => ({ messages: [] }));
			})
			.then((data: unknown) => {
				if (cancelled) return;
				const parsed = data as { messages?: Message[] };
				const messages = parsed?.messages ?? [];
				setChatMessages((_prev) => messages as typeof _prev);
			})
			.catch(() => {
				if (!cancelled) setChatMessages((_prev) => [] as typeof _prev);
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
	]);

	useEffect(() => {
		void agentMessages;
	}, [agentMessages]);

	// Scroll to bottom on mount - only if there are messages and not loading
	useEffect(() => {
		// Scroll to bottom once when the page loads with messages
		if (agentMessages.length > 0 && !isLoading) {
			const chatContainer = document.getElementById(chatContainerId);
			if (chatContainer) {
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}
		}
	}, [agentMessages.length, isLoading, chatContainerId]);

	// Scroll to bottom when messages change or when agent is responding
	useEffect(() => {
		const chatContainer = document.getElementById(chatContainerId);
		if (chatContainer) {
			// Smooth scroll to bottom when messages change
			chatContainer.scrollTo({
				top: chatContainer.scrollHeight,
				behavior: "smooth",
			});
		}
	}, [chatContainerId]);

	// Debug modal state changes
	useEffect(() => {}, []);

	// Function to handle suggested prompts (chip click → invisible user message)
	const handleSuggestionSubmit = (suggestion: string) => {
		const jwt = authState.getStoredJwt();
		invisibleUserContentsRef.current.add(suggestion);

		// Always send the message to the agent - let the agent handle auth requirements
		append({
			role: "user",
			content: suggestion,
			data: jwt
				? { jwt, campaignId: selectedCampaignId ?? null }
				: { campaignId: selectedCampaignId ?? null },
		});
		// Emit a system marker indicating this user message is now processed client-side
		// We cannot reference the id synchronously here; a subsequent append will attach the id.
		setInput("");
		// Scroll to bottom after user sends a message
		setTimeout(() => {
			const chatContainer = document.getElementById(chatContainerId);
			if (chatContainer) {
				chatContainer.scrollTo({
					top: chatContainer.scrollHeight,
					behavior: "smooth",
				});
			}
		}, 100);
	};

	// Handle help button: invoke the chat agent for intelligent, docs-aware help (no static content)
	const handleHelpAction = useCallback(
		(action: string) => {
			if (action === "open_help") {
				const jwt = authState.getStoredJwt();
				const helpPrompt =
					"I need help with LoreSmith. Please act as a help agent: explain what you can help me with, give example questions I can ask, and share guidance on app functionality and best practices. Base your response on the product documentation and how the app is designed to be used.";
				invisibleUserContentsRef.current.add(helpPrompt);
				append({
					role: "user",
					content: helpPrompt,
					data: jwt
						? { jwt, campaignId: selectedCampaignId ?? null }
						: { campaignId: selectedCampaignId ?? null },
				});
				setInput("");
				return;
			}
			if (action === "usage_limits") {
				modalState.handleUsageLimitsOpen();
				return;
			}
			// Legacy: specific topic from elsewhere (e.g. future dropdown) → static content
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

	// Handle session recap request
	const handleSessionRecapRequest = useCallback(async () => {
		console.log("[App] Session recap request triggered");

		if (!selectedCampaignId) {
			console.error("No campaign selected for session recap");
			return;
		}

		try {
			const jwt = authState.getStoredJwt();
			if (!jwt) {
				console.error("No JWT available for session recap request");
				return;
			}

			// Send a message to trigger session digest agent
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

	// Handle next steps request
	const handleNextStepsRequest = useCallback(async () => {
		console.log("[App] Next steps request triggered");

		if (!selectedCampaignId) {
			console.error("No campaign selected for next steps");
			return;
		}

		try {
			const jwt = authState.getStoredJwt();
			if (!jwt) {
				console.error("No JWT available for next steps request");
				return;
			}

			const role = selectedCampaign?.role ?? null;
			const isPlayerRole = role !== null && PLAYER_ROLES.has(role as any);

			// Send a message to trigger recap (next steps) agent
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

	// Scroll to bottom when messages change
	useEffect(() => {
		// Only scroll if there are messages and we're not in the initial load
		if (agentMessages.length > 0 && !isLoading) {
			// Add a small delay to ensure the messages are rendered
			const timer = setTimeout(() => {
				// messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); // This line is removed
			}, 100);
			return () => clearTimeout(timer);
		}
	}, [agentMessages.length, isLoading]);

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

	const formatTime = (date: Date) => {
		return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	};

	// Enhanced form submission handler that includes JWT
	const handleFormSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!(agentInput ?? "").trim()) return;

		// Update activity timestamp on message send
		updateActivity();

		const jwt = authState.getStoredJwt();

		// Always send the message to the agent - let the agent handle auth requirements
		// The agent will detect missing keys and trigger the auth modal via onFinish callback
		append({
			role: "user",
			content: agentInput ?? "",
			data: jwt
				? { jwt, campaignId: selectedCampaignId ?? null }
				: { campaignId: selectedCampaignId ?? null },
		});
		setInput("");
		setTextareaHeight("auto"); // Reset height after submission
		// Scroll to bottom after user sends a message
		setTimeout(() => {
			const chatContainer = document.getElementById(chatContainerId);
			if (chatContainer) {
				chatContainer.scrollTo({
					top: chatContainer.scrollHeight,
					behavior: "smooth",
				});
			}
		}, 100);
	};

	// Enhanced key down handler that includes JWT
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault();
			if (!(agentInput ?? "").trim()) return;

			const jwt = authState.getStoredJwt();

			// Always send the message to the agent - let the agent handle auth requirements
			// The agent will detect missing keys and trigger the auth modal via onFinish callback
			append({
				role: "user",
				content: agentInput ?? "",
				data: jwt
					? { jwt, campaignId: selectedCampaignId ?? null }
					: { campaignId: selectedCampaignId ?? null },
			});
			setInput("");
			setTextareaHeight("auto"); // Reset height on Enter submission
			// Scroll to bottom after user sends a message
			setTimeout(() => {
				const chatContainer = document.getElementById(chatContainerId);
				if (chatContainer) {
					chatContainer.scrollTo({
						top: chatContainer.scrollHeight,
						behavior: "smooth",
					});
				}
			}, 100);
		}
	};

	// Helper function to format shards as a readable chat message

	const {
		shards: globalShards,
		isLoading: shardsLoading,
		fetchAllStagedShards,
		removeProcessedShards,
	} = useGlobalShardManager(authState.getStoredJwt);

	const campaignIdsWithShardApprovalPermission = useMemo(() => {
		const allowed = new Set<string>();
		for (const c of campaigns) {
			if (
				c.role === CAMPAIGN_ROLES.OWNER ||
				c.role === CAMPAIGN_ROLES.EDITOR_GM
			) {
				allowed.add(c.campaignId);
			}
		}
		return allowed;
	}, [campaigns]);

	const visibleShardGroups = useMemo(() => {
		const getShardCampaignId = (group: any): string | null => {
			return (
				group?.campaignId ||
				group?.sourceRef?.meta?.campaignId ||
				group?.sourceRef?.campaignId ||
				group?.metadata?.campaignId ||
				null
			);
		};

		return globalShards.filter((group) => {
			const campaignId = getShardCampaignId(group);
			if (!campaignId) return false;
			return campaignIdsWithShardApprovalPermission.has(campaignId);
		});
	}, [globalShards, campaignIdsWithShardApprovalPermission]);

	const canReviewShards =
		campaignIdsWithShardApprovalPermission.size > 0 &&
		(!selectedCampaignId ||
			campaignIdsWithShardApprovalPermission.has(selectedCampaignId));

	useAppEventHandlers({
		modalState,
		refetchCampaigns,
		fetchAllStagedShards,
		authReady,
		selectedCampaignId,
		isLoading,
		checkHasBeenAway,
		checkShouldShowRecap,
		markRecapShown,
		append,
		authState,
		onContextRecapRequest: () =>
			invisibleUserContentsRef.current.add(CONTEXT_RECAP_PLACEHOLDER),
	});

	const shardsReadyRefetchTimeoutRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null);

	useEffect(() => {
		return () => {
			if (shardsReadyRefetchTimeoutRef.current) {
				clearTimeout(shardsReadyRefetchTimeoutRef.current);
				shardsReadyRefetchTimeoutRef.current = null;
			}
		};
	}, []);

	useUiHints({
		onUiHint: async ({ type, data }) => {
			if (
				type === "shards_ready" &&
				data &&
				typeof data === "object" &&
				"campaignId" in data &&
				typeof data.campaignId === "string"
			) {
				// Debounce: schedule one full refetch so we get all staging entities
				// (multiple notifications can race; full refetch avoids partial counts)
				if (shardsReadyRefetchTimeoutRef.current) {
					clearTimeout(shardsReadyRefetchTimeoutRef.current);
				}
				shardsReadyRefetchTimeoutRef.current = setTimeout(() => {
					shardsReadyRefetchTimeoutRef.current = null;
					fetchAllStagedShards();
				}, 800);
			}
		},
	});

	// Fetch shards when authentication completes
	useEffect(() => {
		if (authState.isAuthenticated) {
			fetchAllStagedShards();
		}
	}, [authState.isAuthenticated, fetchAllStagedShards]);

	if (joinToken) {
		return (
			<>
				<JoinCampaignPage
					token={joinToken}
					jwt={authState.getStoredJwt()}
					onOpenAuthModal={() => modalState.setShowAuthModal(true)}
					onJoinSuccess={handleJoinSuccess}
				/>
				<AppModals
					modalState={modalState}
					authState={authState}
					campaigns={campaigns}
					refetchCampaigns={refetchCampaigns}
					createCampaign={createCampaign}
					handleUpload={handleUpload}
					handleFileUpdate={handleFileUpdate}
					addFileToCampaigns={addFileToCampaigns}
					addLocalNotification={addLocalNotification}
					onProposalConfirm={onProposalConfirm}
					onProposalCancel={onProposalCancel}
				/>
			</>
		);
	}

	return (
		<>
			<Joyride
				stepIndex={stepIndex}
				steps={[
					{
						target: "body",
						content:
							"Welcome to LoreSmith. This short tour will show you how to forge, explore, and refine your lore.",
						placement: "center",
						disableBeacon: true,
						locale: { next: "Start tour" },
					},
					{
						target: ".tour-user-menu",
						content:
							"Your account menu: switch accounts or update your API key from here.",
						locale: { next: "Next" },
					},
					{
						target: ".tour-sidebar",
						content:
							"Sidebar: this contains your campaigns and resource library.",
						placement: "right",
					},
					{
						target: ".tour-campaigns-section",
						content:
							"Campaigns: your campaigns live here. Each campaign is a persistent game world, tracking lore, documents, and state over time.",
					},
					{
						target: ".tour-library-section",
						content: (
							<>
								<p>
									Resource library: source materials you link to a campaign
									(notes, documents, references).
								</p>
								<br />
								<p>
									LoreSmith extracts shards from them (discrete pieces of lore
									like characters, places, and items), which you'll review
									before they're added to your campaign.
								</p>
							</>
						),
					},
					{
						target: ".tour-shard-review",
						content: (
							<div>
								<p>
									After linking a resource to a campaign, you'll review and
									approve shards here before they're added to your campaign.
								</p>
								<p className="mt-3 font-bold">What are shards?</p>
								<p className="mt-2">
									Shards are fragments of lore you approve into your campaign.
									LoreSmith links related shards so it can internalize your
									world and help you plan and grow your campaign more
									accurately.
								</p>
							</div>
						),
					},
					{
						target: ".chat-input-area",
						content: "Chat: where you and LoreSmith shape your tale.",
						placement: "left",
					},
					{
						target: ".tour-campaign-selector",
						content: (
							<>
								<p>
									Campaign selector: this sets which campaign you're working on.
								</p>
								<br />
								<p>
									LoreSmith uses it to choose which resources, sessions, and
									world state to use in replies.
								</p>
							</>
						),
					},
					{
						target: ".tour-session-recap",
						content: (
							<>
								<p>Session recap: record what happened in a session.</p>
								<br />
								<p>
									LoreSmith turns your notes into a digest and updates your
									campaign world state.
								</p>
							</>
						),
					},
					{
						target: ".tour-next-steps",
						content:
							"Next steps: this prompts LoreSmith to provide an assessment of your campaign and prioritized suggestions for what to do next.",
					},
					{
						target: ".tour-help-button",
						content:
							"Help: starts a chat with LoreSmith about app functionality—what it can help with, example questions you can ask, and best practices based on the docs.",
					},
					{
						target: ".tour-admin-dashboard",
						content: "Admin dashboard: shows telemetry and system metrics.",
					},
					{
						target: ".tour-notifications",
						content:
							"Notifications: shows real-time updates (e.g. when shards are ready to review) on file processing and other campaign activity.",
						disableBeacon: true,
					},
				]}
				run={runTour}
				continuous
				showSkipButton
				disableCloseOnEsc={false}
				disableScrolling={false}
				spotlightClicks={false}
				callback={handleJoyrideCallback}
				locale={{
					next: "Next",
					last: "Done",
					skip: "Skip tour",
					back: "Back",
				}}
				styles={{
					options: {
						zIndex: 10000,
						arrowColor: "#262626",
						backgroundColor: "#262626",
						primaryColor: "#c084fc",
						textColor: "#e5e5e5",
					},
					tooltip: {
						backgroundColor: "#262626",
						borderRadius: "0.5rem",
						color: "#e5e5e5",
						fontSize: "0.875rem",
						padding: "1.5rem",
					},
					tooltipContainer: {
						textAlign: "left",
					},
					tooltipContent: {
						padding: "0.5rem 0",
					},
					buttonNext: {
						backgroundColor: "transparent",
						color: "#c084fc",
						fontSize: "0.875rem",
						fontWeight: 600,
						padding: "0.5rem 0",
						borderRadius: "0",
						outline: "none",
						border: "none",
					},
					buttonBack: {
						backgroundColor: "transparent",
						color: "#9ca3af",
						fontSize: "0.875rem",
						fontWeight: 600,
						padding: "0.5rem 0",
						marginRight: "1rem",
						border: "none",
					},
					buttonSkip: {
						backgroundColor: "transparent",
						color: "#9ca3af",
						fontSize: "0.875rem",
						fontWeight: 600,
						border: "none",
					},
					buttonClose: {
						display: "none",
					},
				}}
			/>
			<div className="h-dvh w-full p-0 sm:p-4 md:p-6 flex justify-center items-center bg-fixed">
				<div className="h-full sm:h-[calc(100dvh-2rem)] md:h-[calc(100dvh-3rem)] w-full mx-auto max-w-[1400px] flex flex-col shadow-2xl rounded-none sm:rounded-2xl relative border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 overflow-hidden">
					{/* Top Header - LoreSmith Branding */}
					<AppHeader
						onToggleSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
						isSidebarOpen={isMobileSidebarOpen}
						onHelpAction={handleHelpAction}
						onSessionRecapRequest={
							selectedCampaign?.role &&
							!PLAYER_ROLES.has(selectedCampaign.role as any)
								? handleSessionRecapRequest
								: undefined
						}
						onNextStepsRequest={handleNextStepsRequest}
						notifications={allNotifications}
						onDismissNotification={dismissNotification}
						onClearAllNotifications={clearAllNotifications}
						selectedCampaignId={selectedCampaignId}
						onAdminDashboardOpen={modalState.handleAdminDashboardOpen}
						selectedCampaignRole={selectedCampaign?.role ?? null}
					/>

					{/* Main Content Area */}
					<div className="flex-1 flex min-h-0 overflow-hidden rounded-bl-2xl rounded-br-2xl relative">
						{/* Desktop resource side panel */}
						<ResourceSidePanel
							className="hidden md:flex"
							isAuthenticated={authState.isAuthenticated}
							campaigns={campaigns}
							selectedCampaignId={selectedCampaignId ?? undefined}
							onLogout={handleLogout}
							showUserMenu={authState.showUserMenu}
							setShowUserMenu={authState.setShowUserMenu}
							triggerFileUpload={triggerFileUpload}
							onFileUploadTriggered={handleFileUploadTriggered}
							onCreateCampaign={modalState.handleCreateCampaign}
							onCampaignClick={modalState.handleCampaignClick}
							onAddResource={modalState.handleAddResource}
							onAddToCampaign={modalState.handleAddToCampaign}
							onEditFile={modalState.handleEditFile}
							campaignAdditionProgress={campaignAdditionProgress}
							isAddingToCampaigns={isAddingToCampaigns}
							addLocalNotification={addLocalNotification}
							onShowUsageLimits={modalState.handleUsageLimitsOpen}
						/>

						{/* Mobile resource side panel drawer */}
						{isMobileSidebarOpen && (
							<>
								<div
									className="absolute inset-0 z-30 md:hidden bg-black/40"
									onClick={() => setIsMobileSidebarOpen(false)}
									aria-hidden="true"
								/>
								<ResourceSidePanel
									className="absolute inset-0 z-40 md:hidden w-full max-w-none shadow-2xl"
									isAuthenticated={authState.isAuthenticated}
									campaigns={campaigns}
									selectedCampaignId={selectedCampaignId ?? undefined}
									onLogout={handleLogout}
									showUserMenu={authState.showUserMenu}
									setShowUserMenu={authState.setShowUserMenu}
									triggerFileUpload={triggerFileUpload}
									onFileUploadTriggered={handleFileUploadTriggered}
									onCreateCampaign={modalState.handleCreateCampaign}
									onCampaignClick={modalState.handleCampaignClick}
									onAddResource={modalState.handleAddResource}
									onAddToCampaign={modalState.handleAddToCampaign}
									onEditFile={modalState.handleEditFile}
									campaignAdditionProgress={campaignAdditionProgress}
									isAddingToCampaigns={isAddingToCampaigns}
									addLocalNotification={addLocalNotification}
									onShowUsageLimits={modalState.handleUsageLimitsOpen}
								/>
							</>
						)}

						<div className="flex-1 flex flex-col min-h-0">
							{/* Chat Area */}
							<ChatArea
								chatContainerId={chatContainerId}
								messages={agentMessages as Message[]}
								chatHistoryLoading={!chatHistoryLoaded}
								input={agentInput ?? ""}
								onInputChange={(e) => {
									handleAgentInputChange(e);
									// Auto-resize the textarea
									e.target.style.height = "auto";
									const newHeight = Math.max(40, e.target.scrollHeight); // Minimum 40px height
									e.target.style.height = `${newHeight}px`;
									setTextareaHeight(`${newHeight}px`);
								}}
								onFormSubmit={handleFormSubmit}
								onKeyDown={handleKeyDown}
								isLoading={isLoading}
								onStop={stop}
								formatTime={formatTime}
								agentStatus={agentStatus}
								onSuggestionSubmit={handleSuggestionSubmit}
								onUploadFiles={() => setTriggerFileUpload(true)}
								textareaHeight={textareaHeight}
								pendingToolCallConfirmation={pendingToolCallConfirmation}
								campaigns={campaigns}
								selectedCampaignId={selectedCampaignId}
								onSelectedCampaignChange={setSelectedCampaignId}
								onCreateCampaign={modalState.handleCreateCampaign}
								invisibleUserContents={invisibleUserContentsRef.current}
							/>
						</div>
					</div>
				</div>

				{/* Shard Management Overlay (GM/editor only) */}
				{canReviewShards && (
					<ShardOverlay
						shards={visibleShardGroups}
						isLoading={shardsLoading}
						onShardsProcessed={removeProcessedShards}
						getJwt={authState.getStoredJwt}
						onAutoExpand={() => {
							// Optional: Add any additional logic when auto-expanding
							console.log("Shard overlay auto-expanded due to new shards");
						}}
						onRefresh={fetchAllStagedShards}
					/>
				)}
			</div>

			<AppModals
				modalState={modalState}
				authState={authState}
				campaigns={campaigns}
				refetchCampaigns={refetchCampaigns}
				createCampaign={createCampaign}
				handleUpload={handleUpload}
				handleFileUpdate={handleFileUpdate}
				addFileToCampaigns={addFileToCampaigns}
				addLocalNotification={addLocalNotification}
				onProposalConfirm={onProposalConfirm}
				onProposalCancel={onProposalCancel}
			/>
		</>
	);

}
