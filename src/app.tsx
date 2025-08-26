import { useEffect, useState } from "react";
import { BlockingAuthenticationModal } from "./components/BlockingAuthenticationModal";
import { ChatHeader } from "./components/chat/ChatHeader";
import { ChatInput } from "./components/chat/ChatInput";
import { ChatMessages } from "./components/chat/ChatMessages";
import { WelcomeMessage } from "./components/chat/WelcomeMessage";
import { ResourceSidePanel } from "./components/resource-side-panel";
import { useAuthentication } from "./hooks/useAuthentication";
import { useChat } from "./hooks/useChat";
import { useJwtExpiration } from "./hooks/useJwtExpiration";
import { useTheme } from "./hooks/useTheme";
import { getHelpResponse } from "./utils/helpActions";

export default function Chat() {
  const [showDebug, setShowDebug] = useState(false);

  // Use custom hooks for state management
  const {
    isAuthenticated,
    username,
    storedOpenAIKey,
    showAuthModal,
    showUserMenu,
    setShowAuthModal,
    setShowUserMenu,
    handleAuthenticationSubmit,
    handleLogout,
  } = useAuthentication();

  const { theme, toggleTheme } = useTheme();

  // Handle JWT expiration globally
  useJwtExpiration({
    onExpiration: () => {
      // JWT expired - no annoying toasts needed
    },
  });

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
  }, [showUserMenu, setShowUserMenu]);

  // Use chat hook
  const {
    messages,
    input: agentInput,
    isLoading,
    pendingToolCallConfirmation,
    textareaHeight,
    handleInputChange,
    handleFormSubmit,
    handleKeyDown,
    handleSuggestionSubmit,
    handleClearHistory,
    stop,
    setInput,
    append,
    addToolResult,
  } = useChat(
    () => setShowAuthModal(true), // onAuthenticationRequired
    () => {
      // onFileOperation
      window.dispatchEvent(
        new CustomEvent("file-changed", {
          detail: { type: "file-changed", operation: "detected" },
        })
      );
    }
  );

  // Handle help button actions
  const handleHelpAction = (action: string) => {
    const response = getHelpResponse(action);

    // Add the help response as an assistant message
    append({
      role: "assistant",
      content: response,
      id: `help-${Date.now()}`,
    });
    setInput("");
  };

  return (
    <>
      <div className="h-[100vh] w-full p-4 flex justify-center items-center bg-fixed overflow-hidden">
        <div className="h-[calc(100vh-2rem)] w-full mx-auto max-w-[1400px] flex shadow-xl rounded-md overflow-hidden relative border border-neutral-300 dark:border-neutral-800">
          {/* Resource Side Panel */}
          <ResourceSidePanel
            isAuthenticated={isAuthenticated}
            onLogout={handleLogout}
            showUserMenu={showUserMenu}
            setShowUserMenu={setShowUserMenu}
          />

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col">
            <ChatHeader
              showDebug={showDebug}
              setShowDebug={setShowDebug}
              theme={theme}
              toggleTheme={toggleTheme}
              handleClearHistory={handleClearHistory}
              handleHelpAction={handleHelpAction}
            />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col">
              {messages.length === 0 && (
                <WelcomeMessage
                  handleSuggestionSubmit={handleSuggestionSubmit}
                />
              )}

              <ChatMessages
                messages={messages}
                isLoading={isLoading}
                showDebug={showDebug}
                addToolResult={addToolResult}
              />
            </div>

            {/* Input Area */}
            <ChatInput
              agentInput={agentInput}
              handleInputChange={handleInputChange}
              handleFormSubmit={handleFormSubmit}
              handleKeyDown={handleKeyDown}
              pendingToolCallConfirmation={pendingToolCallConfirmation}
              isLoading={isLoading}
              stop={stop}
              textareaHeight={textareaHeight}
              setTextareaHeight={(height) => {
                // This is handled in the ChatInput component
              }}
            />
          </div>
        </div>
      </div>

      <BlockingAuthenticationModal
        isOpen={showAuthModal}
        username={username}
        storedOpenAIKey={storedOpenAIKey}
        onSubmit={handleAuthenticationSubmit}
      />
    </>
  );
}
