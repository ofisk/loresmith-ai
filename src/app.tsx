import type { Message } from "@ai-sdk/react";
import { useAgentChat } from "agents/ai-react";
import { useAgent } from "agents/react";
import { useEffect, useState, useId } from "react";

// Component imports
import {
  useAuth,
  ChatHeader,
  WelcomeMessage,
  ChatInput,
  ChatMessages,
  useHelpSystem,
  useSessionManager,
  ThinkingSpinner,
  ResourceSidePanel,
  BlockingAuthenticationModal,
} from "@/components";

import { useJwtExpiration } from "./hooks/useJwtExpiration";
import type { campaignTools } from "./tools/campaign";
import type { generalTools } from "./tools/general";
import type { fileTools } from "./tools/file";

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
  const chatContainerId = useId();
  const [showDebug, setShowDebug] = useState(false);

  // Use extracted hooks
  const auth = useAuth();
  const { sessionId, handleClearHistory } = useSessionManager();

  // Handle JWT expiration globally
  useJwtExpiration({
    onExpiration: () => {
      // JWT expired - no annoying toasts needed
    },
  });

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

      // Check if the response indicates authentication is required
      if (result.content?.includes("AUTHENTICATION_REQUIRED:")) {
        console.log(
          "[App] Authentication required detected, showing auth modal"
        );
        auth.setShowAuthModal(true);
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
        auth.setShowAuthModal(true);
      } else {
        console.log("[App] Different error type, not showing auth modal");
      }
    },
  });

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
    console.log("[App] showAuthModal changed to:", auth.showAuthModal);
  }, [auth.showAuthModal]);

  // Function to handle suggested prompts
  const handleSuggestionSubmit = (suggestion: string) => {
    const jwt = auth.getStoredJwt?.();
    console.log("[App] handleSuggestionSubmit sending JWT:", jwt);

    // Always send the message to the agent - let the agent handle auth requirements
    append({
      role: "user",
      content: suggestion,
      data: jwt ? { jwt } : undefined,
    });
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
  const handleClearHistoryWithReload = () => {
    clearHistory();
    handleClearHistory();
  };

  // Use help system hook
  const { handleHelpAction } = useHelpSystem({
    append,
    setInput,
    getStoredJwt: auth.getStoredJwt || (() => null),
  });

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

  // Enhanced form submission handler that includes JWT
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentInput.trim()) return;

    const jwt = auth.getStoredJwt?.();
    console.log("[App] handleFormSubmit sending JWT:", jwt);

    // Always send the message to the agent - let the agent handle auth requirements
    // The agent will detect missing keys and trigger the auth modal via onFinish callback
    append({
      role: "user",
      content: agentInput,
      data: jwt ? { jwt } : undefined,
    });
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

  // Enhanced key down handler that includes JWT
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!agentInput.trim()) return;

      const jwt = auth.getStoredJwt?.();
      console.log("[App] handleKeyDown sending JWT:", jwt);

      // Always send the message to the agent - let the agent handle auth requirements
      // The agent will detect missing keys and trigger the auth modal via onFinish callback
      append({
        role: "user",
        content: agentInput,
        data: jwt ? { jwt } : undefined,
      });
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
    }
  };

  return (
    <>
      <div className="h-[100vh] w-full p-4 flex justify-center items-center bg-fixed overflow-hidden">
        <div className="h-[calc(100vh-2rem)] w-full mx-auto max-w-[1400px] flex shadow-xl rounded-md overflow-hidden relative border border-neutral-300 dark:border-neutral-800">
          {/* Resource Side Panel */}
          <ResourceSidePanel
            isAuthenticated={auth.isAuthenticated}
            username={auth.username}
            onLogout={auth.handleLogout}
            showUserMenu={auth.showUserMenu}
            setShowUserMenu={auth.setShowUserMenu}
          />

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col">
            <ChatHeader
              showDebug={showDebug}
              setShowDebug={setShowDebug}
              onHelpAction={handleHelpAction}
              onClearHistory={handleClearHistoryWithReload}
            />

            {/* Main Content Area */}
            <div
              id={chatContainerId}
              className="flex-1 overflow-y-auto px-6 py-4 space-y-4 pb-32 max-h-[calc(100vh-10rem)]"
            >
              {agentMessages.length === 0 && (
                <WelcomeMessage onSuggestionSubmit={handleSuggestionSubmit} />
              )}

              <ChatMessages
                messages={agentMessages}
                showDebug={showDebug}
                toolsRequiringConfirmation={toolsRequiringConfirmation}
                addToolResult={addToolResult}
              />

              {/* Thinking Spinner - shown when agent is processing */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="w-full">
                    <div className="p-3 rounded-md bg-neutral-100 dark:bg-neutral-900 rounded-bl-none border-assistant-border">
                      <ThinkingSpinner />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <ChatInput
              value={agentInput}
              onChange={handleAgentInputChange}
              onSubmit={handleFormSubmit}
              onKeyDown={handleKeyDown}
              isLoading={isLoading}
              onStop={stop}
              pendingToolCallConfirmation={pendingToolCallConfirmation}
            />
          </div>
        </div>
      </div>

      <BlockingAuthenticationModal
        isOpen={auth.showAuthModal}
        username={auth.username}
        storedOpenAIKey={auth.storedOpenAIKey}
        onSubmit={auth.handleAuthenticationSubmit}
      />
    </>
  );
}
