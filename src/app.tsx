import type { Message } from "@ai-sdk/react";
import { useAgentChat } from "agents/ai-react";
import { useAgent } from "agents/react";
import { generateId } from "ai";
import type React from "react";
import { useCallback, useEffect } from "react";

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
import { API_CONFIG } from "@/shared-config";
import { getHelpContent } from "@/lib/help-content";
import { authenticatedFetchWithExpiration } from "@/services/core/auth-service";

import type { campaignTools } from "@/tools/campaign";
import type { fileTools } from "@/tools/file";
import type { generalTools } from "@/tools/general";
import type { FileMetadata } from "@/dao/file-dao";
import type { StagedShardGroup } from "@/types/shard";

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
  // Modal state must be created first so it can be shared
  const modalState = useModalState();
  const authState = useAppAuthentication();

  // Consolidated app state - pass modalState so it uses the same instance
  const {
    chatContainerId,
    showDebug,
    setShowDebug,
    textareaHeight,
    setTextareaHeight,
    triggerFileUpload,
    setTriggerFileUpload,
    sessionId,
  } = useAppState({ modalState });

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

  // File upload hook
  const { handleUpload } = useFileUpload({
    onUploadSuccess: (filename, fileKey) => {
      console.log("Upload successful:", filename, fileKey);
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
      console.log("File updated:", updatedFile);
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

  const agent = useAgent({
    agent: "chat",
    name: sessionId, // Use the session ID to create a unique Durable Object for this session
  });

  const {
    messages: agentMessages,
    input: agentInput,
    handleInputChange: handleAgentInputChange,
    addToolResult,
    clearHistory,
    isLoading,
    stop,
    setInput,
    append,
  } = useAgentChat({
    agent,
    maxSteps: 5,
    onFinish: (result) => {
      // Check if the response indicates authentication is required
      const resultContent = result.content || "";
      if (
        resultContent.includes("AUTHENTICATION_REQUIRED:") ||
        resultContent.includes("OpenAI API key required") ||
        resultContent.includes("OpenAI API key")
      ) {
        console.log("[App] Authentication required detected in finish result");
        modalState.setShowAuthModal(true);
      }

      // Check if the agent performed file operations that require UI refresh
      const content = result.content?.toLowerCase() || "";
      if (
        content.includes("deleted") ||
        content.includes("successfully deleted")
      ) {
        window.dispatchEvent(
          new CustomEvent("file-changed", {
            detail: { type: "file-changed", operation: "detected" },
          })
        );
      }
    },
    onError: (error) => {
      // Check if the error is related to missing OpenAI API key or authentication
      const errorMessage = error?.message || "";
      const errorName = error?.name || "";

      // Check for authentication-related errors by name or message
      const isAuthError =
        errorName === "AuthenticationRequiredError" ||
        errorName === "OpenAIAPIKeyError" ||
        errorMessage.includes("AUTHENTICATION_REQUIRED:") ||
        errorMessage.includes("OpenAI API key required") ||
        errorMessage.includes("OpenAI API key") ||
        errorMessage.includes("Authentication required");

      if (isAuthError) {
        console.log(
          "[App] Authentication error detected, showing auth modal:",
          {
            errorName,
            errorMessage,
          }
        );
        modalState.setShowAuthModal(true);
      } else {
        console.error("[App] Non-authentication error:", error);
      }
    },
  });
  // Listen for authentication required notifications via ui-hint events
  useEffect(() => {
    const handleUiHint = (e: CustomEvent<{ type: string; data?: unknown }>) => {
      const { type } = e.detail || {};
      if (type === "show_auth_modal") {
        console.log(
          "[App] Authentication required ui-hint received, showing auth modal"
        );
        modalState.setShowAuthModal(true);
      }
    };

    window.addEventListener(
      "ui-hint",
      handleUiHint as unknown as EventListener
    );
    return () => {
      window.removeEventListener(
        "ui-hint",
        handleUiHint as unknown as EventListener
      );
    };
  }, [modalState]);

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

  // Handle guidance request from help button
  const handleGuidanceRequest = useCallback(async () => {
    console.log("[App] Guidance request triggered");

    try {
      const jwt = authState.getStoredJwt();
      if (!jwt) {
        console.error("No JWT available for guidance request");
        return;
      }

      // Send a message to request personalized guidance
      const guidanceMessage =
        "I need help with what to do next. Can you analyze my current state and provide personalized guidance on next steps?";

      // Use the existing append function to send the message with JWT data
      await append({
        id: generateId(),
        role: "user",
        content: guidanceMessage,
        data: {
          jwt: jwt,
          campaignId: selectedCampaignId ?? null,
        },
      });
    } catch (error) {
      console.error("Error requesting guidance:", error);
    }
  }, [append, authState.getStoredJwt, selectedCampaignId]);

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
        part.toolInvocation.state === "call" &&
        toolsRequiringConfirmation.includes(
          part.toolInvocation.toolName as
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
    if (!agentInput.trim()) return;

    const jwt = authState.getStoredJwt();

    // Always send the message to the agent - let the agent handle auth requirements
    // The agent will detect missing keys and trigger the auth modal via onFinish callback
    append({
      role: "user",
      content: agentInput,
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
      if (!agentInput.trim()) return;

      const jwt = authState.getStoredJwt();

      // Always send the message to the agent - let the agent handle auth requirements
      // The agent will detect missing keys and trigger the auth modal via onFinish callback
      append({
        role: "user",
        content: agentInput,
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

  // Listen for decoupled UI hints
  useUiHints({
    onUiHint: async ({ type, data }) => {
      if (
        type === "shards_ready" &&
        data &&
        typeof data === "object" &&
        "campaignId" in data &&
        typeof data.campaignId === "string"
      ) {
        const campaignId = data.campaignId;
        try {
          const jwt = authState.getStoredJwt();
          if (!jwt) return;
          const { response, jwtExpired } =
            await authenticatedFetchWithExpiration(
              API_CONFIG.buildUrl(
                API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.STAGED_SHARDS(
                  campaignId
                )
              ),
              { jwt }
            );
          if (!jwtExpired && response.ok) {
            const payload = (await response.json()) as {
              shards?: Array<{
                id: string;
                content: string;
                campaignId?: string;
                resourceId?: string;
                [key: string]: unknown;
              }>;
            };
            const rawShards = payload?.shards || [];
            if (rawShards.length > 0) {
              // Get campaign name from campaigns list
              const campaign = campaigns.find(
                (c) => c.campaignId === campaignId
              );
              const campaignName = campaign?.name || "Unknown Campaign";

              // Map to StagedShardGroup format
              // Note: The API returns a simplified shard structure, so we use unknown
              // and let the hook handle proper transformation
              const shards = rawShards.map((shard) => ({
                ...shard,
                campaignId: campaignId,
                resourceId: shard.resourceId || "unknown",
              })) as unknown as StagedShardGroup[];

              console.log("Adding shards to global manager:", {
                campaignId: campaignId,
                campaignName,
                shardCount: shards.length,
                shards: shards,
              });

              // Add shards to global manager
              addShardsFromCampaign(campaignId, campaignName, shards);
            }
          }
        } catch (error) {
          console.error("Failed to fetch shards for UI hint:", error);
        }
      }
    },
  });

  // Global shard manager for unified shard handling
  const {
    shards: globalShards,
    isLoading: shardsLoading,
    fetchAllStagedShards,
    addShardsFromCampaign,
    removeProcessedShards,
  } = useGlobalShardManager(authState.getStoredJwt);

  return (
    <>
      <div className="h-[100vh] w-full p-6 flex justify-center items-center bg-fixed">
        <div className="h-[calc(100vh-3rem)] w-full mx-auto max-w-[1400px] flex flex-col shadow-2xl rounded-2xl relative border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950">
          {/* Top Header - LoreSmith Branding */}
          <AppHeader
            showDebug={showDebug}
            onToggleDebug={() => setShowDebug((prev) => !prev)}
            onClearHistory={handleClearHistory}
            onHelpAction={handleHelpAction}
            onGuidanceRequest={handleGuidanceRequest}
            onSessionRecapRequest={handleSessionRecapRequest}
            onNextStepsRequest={handleNextStepsRequest}
            notifications={allNotifications}
            onDismissNotification={dismissNotification}
            onClearAllNotifications={clearAllNotifications}
            campaigns={campaigns}
            selectedCampaignId={selectedCampaignId}
            onSelectedCampaignChange={setSelectedCampaignId}
            onAdminDashboardOpen={modalState.handleAdminDashboardOpen}
          />

          {/* Main Content Area */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
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
              input={agentInput}
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
              showDebug={showDebug}
              addToolResult={
                addToolResult as (args: {
                  toolCallId: string;
                  result: unknown;
                }) => void
              }
              formatTime={formatTime}
              onSuggestionSubmit={handleSuggestionSubmit}
              onUploadFiles={() => setTriggerFileUpload(true)}
              textareaHeight={textareaHeight}
              pendingToolCallConfirmation={pendingToolCallConfirmation}
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
