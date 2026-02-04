import type { Message } from "@/types/ai-message";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, generateId } from "ai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Joyride from "react-joyride";

import { API_CONFIG } from "@/shared-config";

// Component imports
import { NOTIFICATION_TYPES } from "@/constants/notification-types";
import { AppHeader } from "@/components/app/AppHeader";
import { ChatArea } from "@/components/app/ChatArea";
import { AppModals } from "@/components/app/AppModals";
import { ResourceSidePanel } from "@/components/resource-side-panel";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useLocalNotifications } from "@/hooks/useLocalNotifications";
import { useModalState } from "@/hooks/useModalState";
import { useAppAuthentication } from "@/hooks/useAppAuthentication";
import { useCampaignAddition } from "@/hooks/useCampaignAddition";
import { useAppState } from "@/hooks/useAppState";
import { useUiHints } from "@/hooks/useUiHints";
import { useGlobalShardManager } from "@/hooks/useGlobalShardManager";
import { ShardOverlay } from "@/components/shard/ShardOverlay";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import { useAppEventHandlers } from "@/hooks/useAppEventHandlers";
import { useAuthReady } from "@/hooks/useAuthReady";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import { getHelpContent } from "@/lib/help-content";

import type { campaignTools } from "@/tools/campaign";
import type { fileTools } from "@/tools/file";
import type { generalTools } from "@/tools/general";
import type { FileMetadata } from "@/dao";

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

  const handleJoyrideCallback = (data: any) => {
    const { action, index, status, type, lifecycle } = data;

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
      return;
    }

    // Skip steps where elements don't exist
    if (lifecycle === "tooltip" && type === "error:target_not_found") {
      console.log("Target not found, skipping step:", index);
      // Let Joyride handle skipping automatically
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

  // Start tour after authentication
  useEffect(() => {
    console.log(
      "[Tour] Effect running - Auth:",
      authState.isAuthenticated,
      "JWT:",
      !!authState.getStoredJwt()
    );
    if (authState.isAuthenticated) {
      console.log("[Tour] Authenticated, starting tour after delay");
      // Always show tour after authentication
      const timer = setTimeout(() => {
        console.log("[Tour] Starting tour now");
        setStepIndex(0); // Reset to first step
        setRunTour(true);
      }, 300); // 300ms delay
      return () => clearTimeout(timer);
    } else {
      console.log("[Tour] Not authenticated yet");
    }
  }, [authState.isAuthenticated]);

  // Debug: Add global function to manually start tour
  useEffect(() => {
    (window as any).startTour = () => {
      console.log("[Tour] Manually starting tour");
      localStorage.removeItem("loresmith-tour-completed");
      setRunTour(true);
      setStepIndex(0);
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
    sessionId,
  } = useAppState({ modalState, authState });

  const {
    createCampaign,
    campaigns,
    selectedCampaignId,
    setSelectedCampaignId,
    refetch: refetchCampaigns,
  } = useCampaigns();
  const {
    allNotifications,
    addLocalNotification,
    dismissNotification,
    clearAllNotifications,
  } = useLocalNotifications();
  const { campaignAdditionProgress, isAddingToCampaigns, addFileToCampaigns } =
    useCampaignAddition();

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
        "File Uploaded Successfully",
        `"${filename}" has been uploaded and is being processed.`
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

  const chatApiUrl =
    API_CONFIG.getApiBaseUrl() + API_CONFIG.ENDPOINTS.CHAT.SEND;
  const jwt = authState.getStoredJwt();

  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: chatApiUrl,
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
        body: { campaignId: selectedCampaignId ?? undefined },
      }),
    [chatApiUrl, jwt, selectedCampaignId]
  );

  const {
    messages: chatMessages,
    setMessages: setChatMessages,
    sendMessage,
    clearError,
    stop,
    status,
  } = useChat({
    id: sessionId,
    transport: chatTransport,
  });

  const [agentInput, setInput] = useState("");
  const [hiddenRequestInProgress, setHiddenRequestInProgress] = useState(false);
  const handleAgentInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    []
  );

  const isLoading =
    status === "streaming" || status === "submitted" || hiddenRequestInProgress;

  const clearHistory = useCallback(() => {
    setChatMessages([]);
    clearError();
  }, [setChatMessages, clearError]);

  const append = useCallback(
    (message: {
      id?: string;
      role: string;
      content: string;
      data?: unknown;
    }) => {
      if (message.role === "user") {
        sendMessage({
          role: "user",
          parts: [{ type: "text", text: message.content ?? "" }],
          id: message.id,
          metadata: message.data,
        });
      } else if (message.role === "assistant") {
        const newMsg = {
          id: message.id ?? generateId(),
          role: "assistant" as const,
          parts: [{ type: "text" as const, text: message.content ?? "" }],
          metadata: message.data,
        };
        setChatMessages((prev) => [...prev, newMsg]);
      }
    },
    [sendMessage, setChatMessages]
  );

  const sendHiddenUserMessage = useCallback(
    async (
      content: string,
      data: { jwt: string; campaignId: string | null }
    ) => {
      setHiddenRequestInProgress(true);
      try {
        const messagesForRequest = [
          ...chatMessages.map((m) => ({
            id: m.id ?? generateId(),
            role: m.role,
            parts:
              m.parts && m.parts.length > 0
                ? m.parts
                : [
                    {
                      type: "text" as const,
                      text: (m as { content?: string }).content ?? "",
                    },
                  ],
            data: (m as { data?: unknown }).data,
          })),
          {
            role: "user" as const,
            parts: [{ type: "text" as const, text: content }],
            data,
          },
        ];
        const res = await fetch(chatApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({
            id: sessionId,
            messages: messagesForRequest,
            campaignId: data.campaignId ?? undefined,
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || `Request failed: ${res.status}`);
        }
        if (!res.body) throw new Error("Empty response body");
        let text = "";
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const parseLine = (raw: string): void => {
          const trimmed = raw.trim();
          if (!trimmed) return;
          let payload = trimmed;
          if (payload.startsWith("data:")) {
            payload = payload.slice(5).trim();
            if (payload === "[DONE]") return;
          }
          try {
            if (payload.startsWith("0:")) {
              const v = JSON.parse(payload.slice(2)) as unknown;
              text +=
                typeof v === "string"
                  ? v
                  : String(
                      (v as { value?: string; delta?: string })?.value ??
                        (v as { value?: string; delta?: string })?.delta ??
                        ""
                    );
            } else {
              const obj = JSON.parse(payload) as {
                type?: string;
                delta?: string;
                value?: string;
              };
              if (obj.type === "text-delta" && typeof obj.delta === "string")
                text += obj.delta;
              else if (typeof obj.value === "string") text += obj.value;
            }
          } catch {
            // skip unparseable lines
          }
        };
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";
          for (const line of lines) parseLine(line);
          if (done) break;
        }
        if (buffer.trim()) parseLine(buffer);
        const displayText =
          text.trim() ||
          "I couldn’t generate a response. Please try again or rephrase.";
        const assistantMsg = {
          id: generateId(),
          role: "assistant" as const,
          parts: [{ type: "text" as const, text: displayText }],
          createdAt: new Date().toISOString(),
        };
        setChatMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Request failed";
        addLocalNotification(
          NOTIFICATION_TYPES.ERROR,
          "Next steps request failed",
          message
        );
      } finally {
        setHiddenRequestInProgress(false);
      }
    },
    [
      chatApiUrl,
      jwt,
      sessionId,
      chatMessages,
      setChatMessages,
      addLocalNotification,
    ]
  );

  const agentMessages = chatMessages as Message[];

  const authReady = useAuthReady();

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

  // Function to handle suggested prompts
  const handleSuggestionSubmit = (suggestion: string) => {
    const jwt = authState.getStoredJwt();

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

  // Enhanced clear history function that creates a new session
  const handleClearHistory = () => {
    clearHistory();
    // Create a completely fresh chat session
    const freshSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem("chat-session-id", freshSessionId);
    // Reload the page to reinitialize with the new session ID
    window.location.reload();
  };

  // Handle help button actions
  const handleHelpAction = (action: string) => {
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
  };

  // Handle guidance request from help button (hidden message, LoreSmith app usage)
  const handleGuidanceRequest = useCallback(async () => {
    const jwt = authState.getStoredJwt();
    if (!jwt) {
      console.error("No JWT available for guidance request");
      return;
    }
    const guidanceMessage =
      "I'd like help getting the most out of LoreSmith. Can you guide me on how to use the app—like the resource library, campaigns, session planning, and what order to do things in—so I can get the best value from it?";
    try {
      await sendHiddenUserMessage(guidanceMessage, {
        jwt,
        campaignId: selectedCampaignId ?? null,
      });
    } catch (error) {
      console.error("Error requesting guidance:", error);
      addLocalNotification(
        NOTIFICATION_TYPES.ERROR,
        "Guidance request failed",
        error instanceof Error ? error.message : "Request failed"
      );
    }
  }, [
    authState.getStoredJwt,
    selectedCampaignId,
    sendHiddenUserMessage,
    addLocalNotification,
  ]);

  // Handle session recap request (hidden message)
  const handleSessionRecapRequest = useCallback(async () => {
    if (!selectedCampaignId) {
      console.error("No campaign selected for session recap");
      return;
    }
    const jwt = authState.getStoredJwt();
    if (!jwt) {
      console.error("No JWT available for session recap request");
      return;
    }
    const recapMessage =
      "I want to record a session recap. Can you guide me through creating a session digest?";
    try {
      await sendHiddenUserMessage(recapMessage, {
        jwt,
        campaignId: selectedCampaignId,
      });
    } catch (error) {
      console.error("Error requesting session recap:", error);
      addLocalNotification(
        NOTIFICATION_TYPES.ERROR,
        "Session recap request failed",
        error instanceof Error ? error.message : "Request failed"
      );
    }
  }, [
    authState.getStoredJwt,
    selectedCampaignId,
    sendHiddenUserMessage,
    addLocalNotification,
  ]);

  // Handle next steps request (sends prompt without showing it in the chat)
  const handleNextStepsRequest = useCallback(async () => {
    if (!selectedCampaignId) {
      console.error("No campaign selected for next steps");
      return;
    }
    const jwt = authState.getStoredJwt();
    if (!jwt) {
      console.error("No JWT available for next steps request");
      return;
    }
    const nextStepsMessage =
      "What should I do next for this campaign? Can you analyze my current state and provide personalized suggestions based on my campaign?";
    try {
      await sendHiddenUserMessage(nextStepsMessage, {
        jwt,
        campaignId: selectedCampaignId,
      });
    } catch (error) {
      console.error("Error requesting next steps:", error);
    }
  }, [authState.getStoredJwt, selectedCampaignId, sendHiddenUserMessage]);

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
    // Immediately send a hidden system marker referencing the last user message
    setTimeout(() => {
      const last = agentMessages[agentMessages.length - 1];
      const processedMessageId = last?.id;
      append({
        role: "system",
        content: "",
        data: {
          type: "client_marker",
          processedMessageId,
          campaignId: selectedCampaignId ?? null,
        },
      });
    }, 0);
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
              <>
                <p>
                  Shard review: this is where you approve or reject those
                  shards.
                </p>
                <br />
                <p>
                  LoreSmith respects your decisions on which shards should be
                  allowed to shape your campaign and which should be avoided.
                </p>
              </>
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
              "Next steps: get a campaign assessment and targeted, campaign-specific suggestions for what to do next (requires a campaign to be selected).",
          },
          {
            target: ".tour-help-button",
            content:
              "Help: get guidance on using LoreSmith (resource library, campaigns, session planning, and how to get the most value from the app).",
          },
          {
            target: ".tour-admin-dashboard",
            content: "Admin dashboard: shows telemetry and system metrics.",
          },
          {
            target: ".tour-clear-history",
            content:
              "Clear history: starts a new chat in this campaign; your campaign data and library are unchanged.",
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
      <div className="h-[100vh] w-full p-6 flex justify-center items-center bg-fixed">
        <div className="h-[calc(100vh-3rem)] w-full mx-auto max-w-[1400px] flex flex-col shadow-2xl rounded-2xl relative border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950">
          {/* Top Header - LoreSmith Branding */}
          <AppHeader
            onClearHistory={handleClearHistory}
            onHelpAction={handleHelpAction}
            onGuidanceRequest={handleGuidanceRequest}
            onSessionRecapRequest={handleSessionRecapRequest}
            onNextStepsRequest={handleNextStepsRequest}
            notifications={allNotifications}
            onDismissNotification={dismissNotification}
            onClearAllNotifications={clearAllNotifications}
            selectedCampaignId={selectedCampaignId}
            onAdminDashboardOpen={modalState.handleAdminDashboardOpen}
          />

          {/* Main Content Area */}
          <div className="flex-1 flex min-h-0 overflow-hidden rounded-bl-2xl rounded-br-2xl">
            {/* Resource Side Panel */}
            <ResourceSidePanel
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
            />

            {/* Chat Area */}
            <ChatArea
              chatContainerId={chatContainerId}
              messages={agentMessages as Message[]}
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
              onSuggestionSubmit={handleSuggestionSubmit}
              onUploadFiles={() => setTriggerFileUpload(true)}
              textareaHeight={textareaHeight}
              pendingToolCallConfirmation={pendingToolCallConfirmation}
              campaigns={campaigns}
              selectedCampaignId={selectedCampaignId}
              onSelectedCampaignChange={setSelectedCampaignId}
            />
          </div>
        </div>

        {/* Shard Management Overlay */}
        <ShardOverlay
          shards={globalShards}
          isLoading={shardsLoading}
          onShardsProcessed={removeProcessedShards}
          getJwt={authState.getStoredJwt}
          onAutoExpand={() => {
            // Optional: Add any additional logic when auto-expanding
            console.log("Shard overlay auto-expanded due to new shards");
          }}
          onRefresh={fetchAllStagedShards}
        />
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
      />
    </>
  );
}
