import type { Message } from "@/types/ai-message";
import { generateId } from "ai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Joyride from "react-joyride";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
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
  }, [authState.isAuthenticated, tourCompleted]);

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
        api: `${API_CONFIG.getApiBaseUrl()}/agents/chat/${sessionId}`,
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
    [sessionId]
  );

  const {
    messages: chatMessages,
    sendMessage,
    setMessages: setChatMessages,
    status: chatStatus,
    stop,
  } = useChat({
    id: sessionId,
    transport: chatTransport,
  });

  const [agentInput, setInput] = useState("");
  const handleAgentInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput((e?.target?.value ?? "").trimStart());
    },
    []
  );

  const agentMessages = chatMessages as Message[];
  const isLoading = chatStatus === "submitted" || chatStatus === "streaming";

  // Tracks user message contents to hide in the UI (button-triggered prompts)
  const invisibleUserContentsRef = useRef<Set<string>>(new Set());

  // Clear invisible set after the agent responds so the same content isn’t hidden if sent again
  useEffect(() => {
    if (
      agentMessages.length > 0 &&
      agentMessages[agentMessages.length - 1]?.role === "assistant"
    ) {
      invisibleUserContentsRef.current.clear();
    }
  }, [agentMessages]);

  const append = useCallback(
    (message: {
      id?: string;
      role: string;
      content: string;
      data?: unknown;
    }) => {
      const text = (message.content ?? "").trim();
      if (message.role === "user") {
        void sendMessage({
          text: text || " ",
          metadata: message.data,
        });
      } else {
        const newMsg = {
          id: message.id ?? generateId(),
          role: message.role as "user" | "assistant" | "system",
          content: text,
          parts: text ? [{ type: "text" as const, text }] : [],
          ...(message.data != null && { data: message.data }),
        };
        setChatMessages((prev) => [...prev, newMsg] as typeof prev);
      }
    },
    [sendMessage, setChatMessages]
  );

  const clearHistory = useCallback(() => {
    setChatMessages([]);
  }, [setChatMessages]);

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

  // Enhanced clear history function that creates a new session
  const handleClearHistory = () => {
    clearHistory();
    // Create a completely fresh chat session
    const freshSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem("chat-session-id", freshSessionId);
    // Reload the page to reinitialize with the new session ID
    window.location.reload();
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
    [append, authState.getStoredJwt, selectedCampaignId]
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

      // Send a message to trigger onboarding agent with campaign context
      const nextStepsMessage =
        "What should I do next for this campaign? Can you analyze my current state and provide personalized suggestions based on my campaign?";
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
  }, [append, authState.getStoredJwt, selectedCampaignId]);

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
              "Help: guidance personalized to your current setup (e.g. first upload, creating a campaign, planning sessions).",
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
              invisibleUserContents={invisibleUserContentsRef.current}
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
