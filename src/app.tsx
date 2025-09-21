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
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { ResourceSidePanel } from "@/components/resource-side-panel";
import { Textarea } from "@/components/textarea/Textarea";
import { ThinkingSpinner } from "@/components/thinking-spinner";
import { Toggle } from "@/components/toggle/Toggle";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";
import { BlockingAuthenticationModal } from "./components/BlockingAuthenticationModal";
import { WelcomeMessage } from "./components/chat/WelcomeMessage";
import { NotificationProvider } from "./components/notifications/NotificationProvider";
import { JWT_STORAGE_KEY } from "./constants";
import { useJwtExpiration } from "./hooks/useJwtExpiration";
import { AuthService } from "./services/auth-service";
import { API_CONFIG } from "./shared";

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

  // Handle file upload trigger callback
  const handleFileUploadTriggered = useCallback(() => {
    setTriggerFileUpload(false);
  }, []);

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

        // Show success message
        console.log("Logged out successfully");

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
      console.log("[App] Agent finished:", result);
      console.log("[App] Result content:", result.content);
      try {
        // Debug: summarize final assistant message parts
        const last = agentMessages[agentMessages.length - 1];
        if (last) {
          const summary = (last.parts || []).map((p: any) => {
            if (p?.type === "text")
              return { type: "text", len: p.text?.length };
            if (p?.type === "tool-invocation") {
              const res = p?.toolInvocation?.result;
              const hasRender = Boolean(res?.data?.type === "render_component");
              return {
                type: "tool",
                tool: p?.toolInvocation?.toolName,
                state: p?.toolInvocation?.state,
                hasResult: Boolean(res != null),
                renderComponent: hasRender ? res?.data?.component : undefined,
              };
            }
            return { type: p?.type };
          });
          console.log("[App][DEBUG] Last assistant message parts:", summary);
        }
      } catch (_e) {}

      // Check if the response indicates authentication is required
      if (result.content?.includes("AUTHENTICATION_REQUIRED:")) {
        console.log(
          "[App] Authentication required detected, showing auth modal"
        );
        setShowAuthModal(true);
      } else {
        console.log("[App] No authentication required in response");
      }

      // Check if the agent performed file operations that require UI refresh
      const content = result.content?.toLowerCase() || "";
      if (
        content.includes("deleted") ||
        content.includes("successfully deleted")
      ) {
        console.log("[App] File operation detected, triggering refresh event");
        window.dispatchEvent(
          new CustomEvent("file-changed", {
            detail: { type: "file-changed", operation: "detected" },
          })
        );
      }
    },
    onError: (error) => {
      console.log("[App] Agent error:", error);
      console.log("[App] Error message:", error.message);
      console.log("[App] Error stack:", error.stack);
      console.log("[App] Error type:", typeof error);
      console.log("[App] Error constructor:", error.constructor.name);
      // Check if the error is related to missing OpenAI API key
      if (
        error.message.includes("AUTHENTICATION_REQUIRED:") ||
        error.message.includes("OpenAI API key required")
      ) {
        console.log(
          "[App] Authentication required error detected, showing auth modal"
        );
        setShowAuthModal(true);
      } else {
        console.log("[App] Different error type, not showing auth modal");
      }
    },
  });
  // Debug when agent messages change - inspect most recent message for render payloads
  useEffect(() => {
    const last = agentMessages[agentMessages.length - 1];
    if (!last) return;
    try {
      const hasRender = (last.parts || []).some((p: any) =>
        Boolean(
          (p as any)?.data?.type === "render_component" ||
            ((p as any)?.type === "tool-invocation" &&
              (p as any)?.toolInvocation?.result?.data?.type ===
                "render_component")
        )
      );
      console.log("[App][DEBUG] Message render check:", {
        id: last.id,
        parts: (last.parts || []).length,
        hasRender,
      });
    } catch (_e) {}
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
  useEffect(() => {
    console.log("[App] showAuthModal changed to:", showAuthModal);
  }, [showAuthModal]);

  // Function to handle suggested prompts
  const handleSuggestionSubmit = (suggestion: string) => {
    const jwt = getStoredJwt();
    console.log("[App] handleSuggestionSubmit sending JWT:", jwt);

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
    console.log("[App] handleHelpAction:", action);

    let response = "";
    switch (action) {
      case "upload_resource":
        response =
          "## 📁 Uploading Resources\n\n" +
          "To upload resources to your inspiration library:\n\n" +
          "1. **Look for the 'Add to library' button** in the interface\n" +
          "2. **Click the button** to open the upload modal\n" +
          "3. **Drag and drop files** directly onto the upload area for quick upload\n" +
          "4. **Select files** from your computer if you prefer\n\n" +
          "**Supported file types:** PDF files, images, and other documents\n\n" +
          "Once uploaded, your resources will be available in your inspiration library for campaign planning!";
        break;
      case "create_campaign":
        response =
          "## 🎲 Creating a Campaign\n\n" +
          "To create a new campaign:\n\n" +
          "1. **Look for the 'Create Campaign' button** in the interface\n" +
          "2. **Click the button** to open the campaign creation form\n" +
          "3. **Enter campaign details** including:\n" +
          "- Campaign name\n" +
          "- Description\n" +
          "- Setting details\n" +
          "4. **Save your campaign** to start organizing your resources\n\n" +
          "**Benefits:** Campaigns help you organize your resources, plan sessions, and track your story development!";
        break;
      case "start_chat":
        response =
          "## 💬 Starting a Chat\n\n" +
          "You can start chatting with me right here! Just type your questions about:\n\n" +
          "**Campaign Ideas:**\n" +
          "- World building concepts\n" +
          "- Plot development\n" +
          "- Character creation\n\n" +
          "**GM Topics:**\n" +
          "- Session planning\n" +
          "- Encounter design\n" +
          "- Story pacing\n\n" +
          "**Tips:**\n" +
          "- Be specific with your questions\n" +
          "- Share your campaign context\n" +
          "- Ask for examples or suggestions\n\n" +
          "I'm here to help you develop your campaign ideas and provide guidance!";
        break;
      default:
        response =
          "## 🎯 Getting Started\n\n" +
          "I can help you with various tasks:\n\n" +
          "**📁 Upload Resources:**\n" +
          "- Look for the 'Add to library' button\n" +
          "- Upload PDFs, images, and documents\n\n" +
          "**🎲 Create Campaigns:**\n" +
          "- Use the 'Create Campaign' button\n" +
          "- Organize your story elements\n\n" +
          "**💬 Start Chatting:**\n" +
          "- Just type your questions here\n" +
          "- Ask about campaign ideas, world building, or GM topics\n\n" +
          "**💡 Pro Tip:** Be specific with your questions to get the most helpful responses!";
    }

    // Add the help response as an assistant message
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
    console.log("[App] handleFormSubmit sending JWT:", jwt);

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
      console.log("[App] handleKeyDown sending JWT:", jwt);

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

  // Listen for shard generation events and add them to chat
  useEffect(() => {
    const handleShardsGenerated = async (event: CustomEvent) => {
      const { campaignId, shards, fileName, resourceId } = event.detail;

      console.log("[App] Shards generated for campaign:", campaignId, shards);

      // Directly render the interactive UI via tool response shape
      append({
        role: "assistant",
        content: "", // content not needed for component render
        data: {
          type: "render_component",
          component: "ShardManagementUI",
          props: {
            campaignId,
            shards,
            total: shards.length,
            status: "staged",
            action: "show_staged",
            resourceId,
          },
          message: `Found ${shards.length} shards for ${fileName}.`,
        },
      });
    };

    // Listen for custom shard-generated events
    window.addEventListener(
      "shards-generated",
      handleShardsGenerated as unknown as EventListener
    );

    // Also listen for NotificationProvider's UI render dispatches
    const handleUiRender = (e: CustomEvent) => {
      const { component, props } = e.detail || {};
      if (component === "ShardManagementUI") {
        append({
          role: "assistant",
          content: "",
          data: { type: "render_component", component, props },
        });
      }
    };
    window.addEventListener(
      "ui-render-component",
      handleUiRender as unknown as EventListener
    );

    return () => {
      window.removeEventListener(
        "shards-generated",
        handleShardsGenerated as unknown as EventListener
      );
      window.removeEventListener(
        "ui-render-component",
        handleUiRender as unknown as EventListener
      );
    };
  }, [append]);

  return (
    <NotificationProvider isAuthenticated={isAuthenticated}>
      <div className="h-[100vh] w-full p-4 flex justify-center items-center bg-fixed overflow-hidden">
        <div className="h-[calc(100vh-2rem)] w-full mx-auto max-w-[1400px] flex shadow-xl rounded-md overflow-hidden relative border border-neutral-300 dark:border-neutral-800">
          {/* Resource Side Panel */}
          <ResourceSidePanel
            isAuthenticated={isAuthenticated}
            onLogout={handleLogout}
            showUserMenu={showUserMenu}
            setShowUserMenu={setShowUserMenu}
            triggerFileUpload={triggerFileUpload}
            onFileUploadTriggered={handleFileUploadTriggered}
          />

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col">
            <div className="px-4 py-3 border-b border-neutral-300 dark:border-neutral-800 flex items-center gap-3 sticky top-0 z-10">
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
              className="flex-1 overflow-y-auto px-6 py-4 space-y-4 pb-32 max-h-[calc(100vh-10rem)]"
            >
              {agentMessages.length === 0 && (
                <WelcomeMessage
                  onSuggestionSubmit={handleSuggestionSubmit}
                  onUploadFiles={() => setTriggerFileUpload(true)}
                />
              )}

              {agentMessages
                .filter((m: Message) => {
                  // Hide "Get started" messages from display
                  if (m.role === "user" && m.content === "Get started") {
                    return false;
                  }
                  return true;
                })
                .map((m: Message, _index) => {
                  const isUser = m.role === "user";

                  return (
                    <div key={m.id}>
                      {showDebug && (
                        <pre className="text-xs text-muted-foreground overflow-scroll">
                          {JSON.stringify(
                            {
                              ...m,
                              parts: m.parts?.filter(
                                (part) => part.type !== "tool-invocation"
                              ),
                            },
                            null,
                            2
                          )}
                        </pre>
                      )}
                      <div
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`${
                            isUser
                              ? "flex flex-row-reverse gap-2 max-w-[85%]"
                              : "w-full"
                          }`}
                        >
                          <div className={isUser ? "flex-1" : "w-full"}>
                            <div>
                              {m.parts?.map((part, i) => {
                                // Precompute whether this message carries a render_component payload
                                const hasRenderComponent = Array.isArray(
                                  m.parts
                                )
                                  ? m.parts.some((p: any) =>
                                      Boolean(
                                        (p as any)?.data?.type ===
                                          "render_component" ||
                                          ((p as any)?.type ===
                                            "tool-invocation" &&
                                            (p as any)?.toolInvocation?.result
                                              ?.data?.type ===
                                              "render_component")
                                      )
                                    )
                                  : false;
                                if (i === 0) {
                                  console.log(
                                    "[App][DEBUG] Rendering message:",
                                    {
                                      id: m.id,
                                      hasRenderComponent,
                                      partCount: m.parts?.length,
                                    }
                                  );
                                }
                                // If the previous assistant message already rendered a component, suppress plain text in this follow-up message as well
                                const previousMessage =
                                  agentMessages[
                                    agentMessages.findIndex(
                                      (mm) => mm.id === m.id
                                    ) - 1
                                  ];
                                const prevHasRender =
                                  previousMessage?.parts?.some((p: any) =>
                                    Boolean(
                                      (p as any)?.data?.type ===
                                        "render_component" ||
                                        ((p as any)?.type ===
                                          "tool-invocation" &&
                                          (p as any)?.toolInvocation?.result
                                            ?.data?.type === "render_component")
                                    )
                                  );
                                // Render components pushed via notifications or tools
                                if (
                                  (part as any)?.data?.type ===
                                    "render_component" &&
                                  (part as any)?.data?.component ===
                                    "ShardManagementUI"
                                ) {
                                  console.log(
                                    "[App][DEBUG] Rendering ShardManagementUI from direct data payload"
                                  );
                                  const payload = (part as any).data;
                                  const Comp =
                                    require("./components/chat/ShardManagementUI").ShardManagementUI;
                                  return (
                                    <div
                                      key={`${m.id}-render-direct-${i}`}
                                      className="w-full"
                                    >
                                      <Comp {...payload.props} />
                                    </div>
                                  );
                                }
                                // Render components returned inside tool results (tool-invocation → result → data)
                                if (
                                  part.type === "tool-invocation" &&
                                  (part as any)?.toolInvocation?.result?.data
                                    ?.type === "render_component" &&
                                  (part as any)?.toolInvocation?.result?.data
                                    ?.component === "ShardManagementUI"
                                ) {
                                  console.log(
                                    "[App][DEBUG] Rendering ShardManagementUI from tool result",
                                    (part as any)?.toolInvocation?.toolName
                                  );
                                  const payload = (part as any).toolInvocation
                                    .result.data;
                                  const Comp =
                                    require("./components/chat/ShardManagementUI").ShardManagementUI;
                                  return (
                                    <div
                                      key={`${m.id}-${(part as any)?.toolInvocation?.toolCallId || "tool"}-${i}`}
                                      className="w-full"
                                    >
                                      <Comp {...payload.props} />
                                    </div>
                                  );
                                }
                                // If a prior tool result exists that handled the action, and this part is a generic confirmation text,
                                // suppress it to avoid duplicate prose when an interactive component was rendered.
                                if (
                                  part.type === "text" &&
                                  (hasRenderComponent || prevHasRender)
                                ) {
                                  console.log(
                                    "[App][DEBUG] Suppressing text because render_component is present"
                                  );
                                  return null;
                                }
                                if (part.type === "text") {
                                  console.log(
                                    "[App][DEBUG] Rendering plain text (no render_component in message)"
                                  );
                                  return (
                                    // biome-ignore lint/suspicious/noArrayIndexKey: immutable index
                                    <div key={i}>
                                      <Card
                                        className={`p-3 rounded-md bg-neutral-100 dark:bg-neutral-900 ${
                                          isUser
                                            ? "rounded-br-none"
                                            : "rounded-bl-none border-assistant-border"
                                        } ${
                                          part.text.startsWith(
                                            "scheduled message"
                                          )
                                            ? "border-accent/50"
                                            : ""
                                        } relative`}
                                      >
                                        {part.text.startsWith(
                                          "scheduled message"
                                        ) && (
                                          <span className="absolute -top-3 -left-2 text-base">
                                            🕒
                                          </span>
                                        )}
                                        <MemoizedMarkdown
                                          content={part.text.replace(
                                            /^scheduled message: /,
                                            ""
                                          )}
                                        />
                                      </Card>
                                      <p
                                        className={`text-xs text-muted-foreground mt-1 ${
                                          isUser ? "text-right" : "text-left"
                                        }`}
                                      >
                                        {formatTime(
                                          new Date(
                                            m.createdAt as unknown as string
                                          )
                                        )}
                                      </p>
                                    </div>
                                  );
                                }

                                if (part.type === "tool-invocation") {
                                  const toolInvocation = part.toolInvocation;
                                  const toolCallId = toolInvocation.toolCallId;
                                  const needsConfirmation =
                                    toolsRequiringConfirmation.includes(
                                      toolInvocation.toolName as
                                        | keyof typeof generalTools
                                        | keyof typeof campaignTools
                                        | keyof typeof fileTools
                                    );

                                  // Skip rendering the card when debug is off
                                  if (!showDebug) return null;

                                  return (
                                    <ToolInvocationCard
                                      // biome-ignore lint/suspicious/noArrayIndexKey: using index is safe here as the array is static
                                      key={`${toolCallId}-${i}`}
                                      toolInvocation={toolInvocation}
                                      toolCallId={toolCallId}
                                      needsConfirmation={needsConfirmation}
                                      addToolResult={addToolResult}
                                      showDebug={showDebug}
                                    />
                                  );
                                }
                                return null;
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

              {/* Thinking Spinner - shown when agent is processing */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="w-full">
                    <Card className="p-3 rounded-md bg-neutral-100 dark:bg-neutral-900 rounded-bl-none border-assistant-border">
                      <ThinkingSpinner />
                    </Card>
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <form
              onSubmit={handleFormSubmit}
              className="p-3 bg-neutral-50 border-t border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Textarea
                    disabled={pendingToolCallConfirmation}
                    placeholder={
                      pendingToolCallConfirmation
                        ? "Please respond to the tool confirmation above..."
                        : "What knowledge do you seek today?"
                    }
                    className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-base ring-offset-background placeholder:text-neutral-500 dark:placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-neutral-700 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl !text-base pb-10 dark:bg-neutral-900"
                    value={agentInput}
                    onChange={(e) => {
                      handleAgentInputChange(e);
                      // Auto-resize the textarea
                      e.target.style.height = "auto";
                      e.target.style.height = `${e.target.scrollHeight}px`;
                      setTextareaHeight(`${e.target.scrollHeight}px`);
                    }}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    style={{ height: textareaHeight }}
                  />
                  <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
                    {isLoading ? (
                      <button
                        type="button"
                        onClick={stop}
                        className="inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-1.5 h-fit border border-neutral-200 dark:border-neutral-800"
                        aria-label="Stop generation"
                      >
                        <Stop size={16} />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        className="inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-1.5 h-fit border border-neutral-200 dark:border-neutral-800"
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
    </NotificationProvider>
  );
}
