import type { Message } from "@ai-sdk/react";
import { Bug, PaperPlaneRight, Stop, Trash } from "@phosphor-icons/react";
import { useAgentChat } from "agents/ai-react";
import { useAgent } from "agents/react";
import type React from "react";
import { useCallback, useEffect, useId, useState } from "react";

import loresmith from "@/assets/loresmith.png";

// Component imports
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { HelpButton } from "@/components/help/HelpButton";
import { NotificationBell } from "./components/notifications/NotificationBell";
import { useNotifications } from "./components/notifications/NotificationProvider";
import { ResourceSidePanel } from "@/components/resource-side-panel";
import { CreateCampaignModal } from "@/components/resource-side-panel/CreateCampaignModal";
import { CampaignDetailsModal } from "@/components/resource-side-panel/CampaignDetailsModal";
import { EditFileModal } from "@/components/upload/EditFileModal";
import { ResourceUpload } from "@/components/upload/ResourceUpload";
import { Modal } from "@/components/modal/Modal";
import { ChatInput } from "@/components/input/ChatInput";
import { ThinkingSpinner } from "@/components/thinking-spinner";
import { Toggle } from "@/components/toggle/Toggle";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { BlockingAuthenticationModal } from "./components/BlockingAuthenticationModal";
import { WelcomeMessage } from "./components/chat/WelcomeMessage";
import { NotificationProvider } from "./components/notifications/NotificationProvider";
import { JWT_STORAGE_KEY } from "./app-constants";
import { useJwtExpiration } from "./hooks/useJwtExpiration";
import {
  AuthService,
  authenticatedFetchWithExpiration,
} from "./services/auth-service";
import { useUiHints } from "./hooks/useUiHints";
import { useShardRenderGate } from "./hooks/useShardRenderGate";
import { API_CONFIG } from "./shared-config";
import { getHelpContent } from "./utils/helpContent";

import type { campaignTools } from "./tools/campaign";
import type { fileTools } from "./tools/file";
import type { generalTools } from "./tools/general";

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

/**
 * Generate a unique session ID for this browser session
 * This will be used to create a unique Durable Object ID for each session
 */
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get or create a session ID, persisting it in localStorage
 * This ensures the same session ID is used across browser sessions
 */
function getSessionId(): string {
  const existingSessionId = localStorage.getItem("chat-session-id");
  if (existingSessionId) {
    return existingSessionId;
  }

  const newSessionId = generateSessionId();
  localStorage.setItem("chat-session-id", newSessionId);
  return newSessionId;
}

function TopBarNotifications() {
  const { activeNotifications, dismissNotification, clearActiveNotifications } =
    useNotifications();

  return (
    <div className="ml-1">
      <NotificationBell
        notifications={activeNotifications}
        onDismiss={(notificationId) => {
          const ts = parseInt(notificationId.split("-")[0], 10);
          dismissNotification(ts);
        }}
        onDismissAll={clearActiveNotifications}
      />
    </div>
  );
}

export default function Chat() {
  const chatContainerId = useId();

  const [showDebug, setShowDebug] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState("auto");

  // Authentication state management
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [username, setUsername] = useState<string>("");
  const [storedOpenAIKey, setStoredOpenAIKey] = useState<string>("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [triggerFileUpload, setTriggerFileUpload] = useState(false);
  const [isCreateCampaignModalOpen, setIsCreateCampaignModalOpen] =
    useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [isCampaignDetailsModalOpen, setIsCampaignDetailsModalOpen] =
    useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [isAddResourceModalOpen, setIsAddResourceModalOpen] = useState(false);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [isAddToCampaignModalOpen, setIsAddToCampaignModalOpen] =
    useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [isEditFileModalOpen, setIsEditFileModalOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<any>(null);

  // Handle file upload trigger callback
  const handleFileUploadTriggered = useCallback(() => {
    setTriggerFileUpload(false);
  }, []);

  // Handle create campaign modal
  const handleCreateCampaign = useCallback(() => {
    setIsCreateCampaignModalOpen(true);
  }, []);

  const handleCreateCampaignClose = useCallback(() => {
    setIsCreateCampaignModalOpen(false);
    setCampaignName("");
    setCampaignDescription("");
  }, []);

  const handleCampaignClick = useCallback((campaign: any) => {
    setSelectedCampaign(campaign);
    setIsCampaignDetailsModalOpen(true);
  }, []);

  const handleCampaignDetailsClose = useCallback(() => {
    setIsCampaignDetailsModalOpen(false);
    setSelectedCampaign(null);
  }, []);

  const handleAddResource = useCallback(() => {
    setIsAddResourceModalOpen(true);
  }, []);

  const handleAddResourceClose = useCallback(() => {
    setIsAddResourceModalOpen(false);
  }, []);

  const handleAddToCampaign = useCallback((file: any) => {
    setSelectedFile(file);
    setIsAddToCampaignModalOpen(true);
  }, []);

  const handleAddToCampaignClose = useCallback(() => {
    setIsAddToCampaignModalOpen(false);
    setSelectedFile(null);
  }, []);

  const handleEditFile = useCallback((file: any) => {
    setEditingFile(file);
    setIsEditFileModalOpen(true);
  }, []);

  const handleEditFileClose = useCallback(() => {
    setIsEditFileModalOpen(false);
    setEditingFile(null);
  }, []);

  const handleFileUpdate = useCallback(
    (updatedFile: any) => {
      // TODO: Implement file update logic
      console.log("File updated:", updatedFile);
      handleEditFileClose();
    },
    [handleEditFileClose]
  );

  // Get stored JWT for user operations
  const getStoredJwt = useCallback((): string | null => {
    return localStorage.getItem(JWT_STORAGE_KEY);
  }, []);

  // Check for stored OpenAI key
  const checkStoredOpenAIKey = useCallback(async (username: string) => {
    try {
      const response = await fetch(
        `/get-openai-key?username=${encodeURIComponent(username)}`
      );
      const result = (await response.json()) as {
        hasKey?: boolean;
        apiKey?: string;
      };
      if (response.ok && result.hasKey) {
        setStoredOpenAIKey(result.apiKey || "");
        setIsAuthenticated(true);
      } else {
        // No stored key found, show the auth modal immediately
        setShowAuthModal(true);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error("Error checking stored OpenAI key:", error);
      // Show modal on error as well
      setShowAuthModal(true);
      setIsAuthenticated(false);
    }
  }, []);

  // Check authentication status on mount
  useEffect(() => {
    const payload = AuthService.getJwtPayload();
    if (payload?.username) {
      setUsername(payload.username);
      // Check if JWT is expired
      const jwt = getStoredJwt();
      if (jwt && AuthService.isJwtExpired(jwt)) {
        // JWT expired, show auth modal
        setShowAuthModal(true);
        setIsAuthenticated(false);
      } else {
        // JWT valid, check if we have stored OpenAI key
        checkStoredOpenAIKey(payload.username);
      }
    } else {
      // No JWT, show auth modal
      setShowAuthModal(true);
      setIsAuthenticated(false);
    }
  }, [checkStoredOpenAIKey, getStoredJwt]);

  // Get session ID for this browser session
  const sessionId = getSessionId();

  // Handle JWT expiration globally
  useJwtExpiration({
    onExpiration: () => {
      // JWT expired - no annoying toasts needed
    },
  });

  // Handle authentication submission
  const handleAuthenticationSubmit = async (
    username: string,
    adminKey: string,
    openaiApiKey: string
  ) => {
    try {
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTH.AUTHENTICATE),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username,
            adminSecret: adminKey?.trim() || undefined, // Make admin key optional
            openaiApiKey,
          }),
        }
      );

      const result = (await response.json()) as {
        success?: boolean;
        token?: string;
        error?: string;
      };

      if (response.ok && result.token) {
        // Store JWT token
        AuthService.storeJwt(result.token);

        // Update stored OpenAI key
        setStoredOpenAIKey(openaiApiKey);

        // Set authentication state
        setIsAuthenticated(true);

        // Close modal
        setShowAuthModal(false);
      } else {
        throw new Error(result.error || "Authentication failed");
      }
    } catch (error) {
      console.error("Error during authentication:", error);
      throw error;
    }
  };

  const handleLogout = async () => {
    try {
      // Call the logout endpoint
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTH.LOGOUT),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        // Clear local JWT storage
        AuthService.clearJwt();

        // Reset authentication state
        setIsAuthenticated(false);
        setUsername("");
        setShowUserMenu(false);

        // Optionally show auth modal again
        setShowAuthModal(true);
      } else {
        throw new Error("Logout failed");
      }
    } catch (error) {
      console.error("Logout error:", error);
      console.error("Logout failed. Please try again.");

      // Force clear local state even if server call failed
      AuthService.clearJwt();
      setIsAuthenticated(false);
      setUsername("");
      setShowUserMenu(false);
      setShowAuthModal(true);
    }
  };

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showUserMenu &&
        !(event.target as Element).closest(".user-menu-container")
      ) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showUserMenu]);

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
      if (result.content?.includes("AUTHENTICATION_REQUIRED:")) {
        setShowAuthModal(true);
      } else {
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
      // Check if the error is related to missing OpenAI API key
      if (
        error.message.includes("AUTHENTICATION_REQUIRED:") ||
        error.message.includes("OpenAI API key required")
      ) {
        setShowAuthModal(true);
      } else {
      }
    },
  });
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
    const jwt = getStoredJwt();

    // Always send the message to the agent - let the agent handle auth requirements
    append({
      role: "user",
      content: suggestion,
      data: jwt ? { jwt } : undefined,
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
    // Optionally create a new session ID when clearing history
    // This creates a completely fresh chat session
    const newSessionId = generateSessionId();
    localStorage.setItem("chat-session-id", newSessionId);
    // Reload the page to reinitialize with the new session ID
    window.location.reload();
  };

  // Handle help button actions
  const handleHelpAction = (action: string) => {
    const jwt = getStoredJwt();
    const response = getHelpContent(action);
    append({
      role: "assistant",
      content: response,
      data: jwt ? { jwt } : undefined,
    });
    setInput("");
  };

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

    const jwt = getStoredJwt();

    // Always send the message to the agent - let the agent handle auth requirements
    // The agent will detect missing keys and trigger the auth modal via onFinish callback
    append({
      role: "user",
      content: agentInput,
      data: jwt ? { jwt } : undefined,
    });
    // Immediately send a hidden system marker referencing the last user message
    setTimeout(() => {
      const last = agentMessages[agentMessages.length - 1];
      const processedMessageId = last?.id;
      append({
        role: "system",
        content: "",
        data: { type: "client_marker", processedMessageId },
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

      const jwt = getStoredJwt();

      // Always send the message to the agent - let the agent handle auth requirements
      // The agent will detect missing keys and trigger the auth modal via onFinish callback
      append({
        role: "user",
        content: agentInput,
        data: jwt ? { jwt } : undefined,
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
      if (type === "shards_ready" && data?.campaignId) {
        try {
          const jwt = getStoredJwt();
          if (!jwt) return;
          const { response, jwtExpired } =
            await authenticatedFetchWithExpiration(
              API_CONFIG.buildUrl(
                API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.STAGED_SHARDS(
                  data.campaignId
                )
              ),
              { jwt }
            );
          if (!jwtExpired && response.ok) {
            const payload = (await response.json()) as { shards?: any[] };
            const hasStaged =
              Array.isArray(payload?.shards) && payload.shards.length > 0;
            if (!hasStaged) return;
          }
        } catch {
          return;
        }
        append({
          role: "assistant",
          content: "",
          data: {
            type: "ui_hint",
            hint: { type: "shards_ready", data },
          },
        });
      }
    },
  });

  // Track whether campaigns referenced by shard UI messages still have staged shards
  const campaignIdsForRender = Array.from(
    new Set(
      (agentMessages as any[])
        .map((m) => m?.data)
        .filter(
          (d: any) => d?.type === "ui_hint" && d?.hint?.type === "shards_ready"
        )
        .map((d: any) => d?.hint?.data?.campaignId)
        .filter((cid: any) => typeof cid === "string")
    )
  ) as string[];
  const { shouldRender: shouldRenderShardUI } = useShardRenderGate(
    getStoredJwt,
    campaignIdsForRender
  );

  return (
    <NotificationProvider isAuthenticated={isAuthenticated}>
      <div className="h-[100vh] w-full p-6 flex justify-center items-center bg-fixed overflow-hidden">
        <div className="h-[calc(100vh-3rem)] w-full mx-auto max-w-[1400px] flex shadow-2xl rounded-2xl overflow-hidden relative border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950">
          {/* Resource Side Panel */}
          <ResourceSidePanel
            isAuthenticated={isAuthenticated}
            onLogout={handleLogout}
            showUserMenu={showUserMenu}
            setShowUserMenu={setShowUserMenu}
            triggerFileUpload={triggerFileUpload}
            onFileUploadTriggered={handleFileUploadTriggered}
            onCreateCampaign={handleCreateCampaign}
            onCampaignClick={handleCampaignClick}
            onAddResource={handleAddResource}
            onAddToCampaign={handleAddToCampaign}
            onEditFile={handleEditFile}
          />

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col">
            <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-4 sticky top-0 z-10 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-sm">
              <div
                className="flex items-center justify-center rounded-lg"
                style={{ width: 28, height: 28 }}
              >
                <img
                  src={loresmith}
                  alt="LoreSmith logo"
                  width={28}
                  height={28}
                  className="object-contain"
                />
              </div>

              <div className="flex-1">
                <h2 className="font-semibold text-base">LoreSmith</h2>
              </div>

              <div className="flex items-center gap-2 mr-2">
                <Bug size={16} />
                <Toggle
                  toggled={showDebug}
                  aria-label="Toggle debug mode"
                  onClick={() => setShowDebug((prev) => !prev)}
                />
              </div>

              <HelpButton onActionClick={handleHelpAction} />

              <Button
                variant="ghost"
                size="md"
                shape="square"
                className="rounded-full h-9 w-9"
                onClick={handleClearHistory}
              >
                <Trash size={20} />
              </Button>

              {/* Notifications button styled like other top bar buttons */}
              <TopBarNotifications />
            </div>

            {/* Main Content Area */}
            <div
              id={chatContainerId}
              className="flex-1 overflow-y-auto px-8 py-6 space-y-6 pb-32 max-h-[calc(100vh-10rem)]"
            >
              {agentMessages.length === 0 && (
                <WelcomeMessage
                  onSuggestionSubmit={handleSuggestionSubmit}
                  onUploadFiles={() => setTriggerFileUpload(true)}
                />
              )}

              <ChatMessageList
                messages={agentMessages as Message[]}
                showDebug={showDebug}
                shouldRenderShardUI={(cid?: string) => shouldRenderShardUI(cid)}
                addToolResult={addToolResult}
                formatTime={formatTime}
              />

              {/* Thinking Spinner - shown when agent is processing */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="w-full">
                    <Card className="p-4 rounded-xl bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-bl-none border-assistant-border shadow-sm border border-neutral-200/50 dark:border-neutral-700/50">
                      <ThinkingSpinner />
                    </Card>
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <form
              onSubmit={handleFormSubmit}
              className="p-6 bg-neutral-50/50 border-t border-neutral-200 dark:border-neutral-700 dark:bg-neutral-900/50 backdrop-blur-sm"
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <ChatInput
                    disabled={pendingToolCallConfirmation}
                    placeholder={
                      pendingToolCallConfirmation
                        ? "Please respond to the tool confirmation above..."
                        : "What knowledge do you seek today?"
                    }
                    className="flex w-full border border-neutral-200/50 dark:border-neutral-700/50 px-4 py-3 text-base placeholder:text-neutral-500 dark:placeholder:text-neutral-400 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl !text-base pb-12 dark:bg-neutral-900/80 backdrop-blur-sm shadow-sm"
                    value={agentInput}
                    onChange={(e) => {
                      handleAgentInputChange(e);
                      // Auto-resize the textarea
                      e.target.style.height = "auto";
                      e.target.style.height = `${e.target.scrollHeight}px`;
                      setTextareaHeight(`${e.target.scrollHeight}px`);
                    }}
                    onKeyDown={handleKeyDown}
                    multiline
                    rows={2}
                    style={{ height: textareaHeight }}
                  />
                  <div className="absolute bottom-1 right-1 p-2 w-fit flex flex-row justify-end">
                    {isLoading ? (
                      <button
                        type="button"
                        onClick={stop}
                        className="inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-2 h-fit border border-neutral-200/50 dark:border-neutral-700/50 shadow-sm backdrop-blur-sm"
                        aria-label="Stop generation"
                      >
                        <Stop size={16} />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        className="inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-2 h-fit border border-neutral-200/50 dark:border-neutral-700/50 shadow-sm backdrop-blur-sm"
                        disabled={
                          pendingToolCallConfirmation || !agentInput.trim()
                        }
                        aria-label="Send message"
                      >
                        <PaperPlaneRight size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      <BlockingAuthenticationModal
        isOpen={showAuthModal}
        username={username}
        storedOpenAIKey={storedOpenAIKey}
        onSubmit={handleAuthenticationSubmit}
      />

      {/* Create Campaign Modal */}
      <Modal
        isOpen={isCreateCampaignModalOpen}
        onClose={handleCreateCampaignClose}
        cardStyle={{ width: 520, minHeight: 320 }}
        showCloseButton={true}
      >
        <CreateCampaignModal
          isOpen={isCreateCampaignModalOpen}
          onClose={handleCreateCampaignClose}
          campaignName={campaignName}
          onCampaignNameChange={setCampaignName}
          campaignDescription={campaignDescription}
          onCampaignDescriptionChange={setCampaignDescription}
          onCreateCampaign={(name, description) => {
            // TODO: Implement actual campaign creation
            console.log("Creating campaign:", name, description);
            handleCreateCampaignClose();
          }}
        />
      </Modal>

      {/* Campaign Details Modal */}
      <CampaignDetailsModal
        campaign={selectedCampaign}
        isOpen={isCampaignDetailsModalOpen}
        onClose={handleCampaignDetailsClose}
        onDelete={async (campaignId) => {
          // TODO: Implement actual campaign deletion
          console.log("Deleting campaign:", campaignId);
          handleCampaignDetailsClose();
        }}
        onUpdate={async (campaignId, updates) => {
          // TODO: Implement actual campaign update
          console.log("Updating campaign:", campaignId, updates);
          handleCampaignDetailsClose();
        }}
      />

      {/* Add Resource Modal */}
      <Modal
        isOpen={isAddResourceModalOpen}
        onClose={handleAddResourceClose}
        cardStyle={{ width: 600, minHeight: 400 }}
        showCloseButton={true}
      >
        <ResourceUpload
          onUpload={(fileInfo) => {
            // TODO: Implement actual file upload
            console.log("Uploading file:", fileInfo);
            handleAddResourceClose();
          }}
          onCancel={handleAddResourceClose}
          className="border-0 p-0 shadow-none"
          jwtUsername={getStoredJwt() || ""}
          campaigns={[]} // TODO: Get campaigns from context
          selectedCampaigns={selectedCampaigns}
          onCampaignSelectionChange={setSelectedCampaigns}
          campaignName={campaignName}
          onCampaignNameChange={setCampaignName}
          onCreateCampaign={() => {
            setIsAddResourceModalOpen(false);
            setIsCreateCampaignModalOpen(true);
          }}
          showCampaignSelection={true}
        />
      </Modal>

      {/* Add to Campaign Modal */}
      <Modal
        isOpen={isAddToCampaignModalOpen}
        onClose={handleAddToCampaignClose}
        cardStyle={{ width: 500, maxHeight: "90vh" }}
        showCloseButton={true}
      >
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">
            "{selectedFile ? selectedFile.file_name : ""}" - Add to Campaign
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Select which campaigns to add this resource to:
          </p>
          <div className="space-y-3">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Available campaigns will be listed here
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={handleAddToCampaignClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  // TODO: Implement actual add to campaign logic
                  console.log("Adding file to campaigns:", selectedFile);
                  handleAddToCampaignClose();
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md"
              >
                Add to Campaigns
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Edit File Modal */}
      {editingFile && (
        <EditFileModal
          isOpen={isEditFileModalOpen}
          onClose={handleEditFileClose}
          file={editingFile}
          onUpdate={handleFileUpdate}
        />
      )}
    </NotificationProvider>
  );
}
