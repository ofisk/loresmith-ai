import type { Message } from "@ai-sdk/react";
import {
  Bug,
  Moon,
  PaperPlaneRight,
  Stop,
  Sun,
  Trash,
} from "@phosphor-icons/react";
import { Lightbulb } from "@phosphor-icons/react/dist/ssr";
import { useAgentChat } from "agents/ai-react";
import { useAgent } from "agents/react";
import { useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import loresmith from "@/assets/loresmith.png";
import { Avatar } from "@/components/avatar/Avatar";
// Component imports
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { HelpButton } from "@/components/help/HelpButton";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { PdfUploadAgent } from "@/components/pdf-upload/PdfUploadAgent";
import { Textarea } from "@/components/textarea/Textarea";
import { Toggle } from "@/components/toggle/Toggle";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";
import { BlockingAuthenticationModal } from "./components/BlockingAuthenticationModal";

import { USER_MESSAGES } from "./constants";
import { useJwtExpiration } from "./hooks/useJwtExpiration";
import { AuthService } from "./services/auth-service";

import type { campaignTools } from "./tools/campaign";
import type { generalTools } from "./tools/general";
import type { pdfTools } from "./tools/pdf";

// List of tools that require human confirmation
// NOTE: this should match the keys in the executions object in tools.ts
const toolsRequiringConfirmation: (
  | keyof typeof generalTools
  | keyof typeof campaignTools
  | keyof typeof pdfTools
)[] = [
  // Campaign tools that require confirmation
  "createCampaign",

  // Resource/PDF tools that require confirmation
  "updatePdfMetadata",
  "deletePdfFile",
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

export default function Chat() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    // Check localStorage first, default to dark if not found
    const savedTheme = localStorage.getItem("theme");
    return (savedTheme as "dark" | "light") || "dark";
  });

  const [showDebug, setShowDebug] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState("auto");

  // Authentication state management
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [username, setUsername] = useState<string>("");
  const [storedOpenAIKey, setStoredOpenAIKey] = useState<string>("");

  // Get stored JWT for user operations
  const getStoredJwt = useCallback((): string | null => {
    const jwt = localStorage.getItem("loresmith-jwt");
    console.log("[App] getStoredJwt() returns:", jwt);
    return jwt;
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
      } else {
        // No stored key found, show the auth modal immediately
        console.log("[App] No stored OpenAI key found for user:", username);
        console.log("[App] Showing auth modal immediately");
        setShowAuthModal(true);
      }
    } catch (error) {
      console.error("Error checking stored OpenAI key:", error);
      // Show modal on error as well
      console.log("[App] Error checking stored key, showing auth modal");
      setShowAuthModal(true);
    }
  }, []);

  // Check authentication status on mount
  useEffect(() => {
    console.log("[App] useEffect running - checking authentication status");
    const jwt = getStoredJwt();
    if (jwt) {
      try {
        const payload = JSON.parse(atob(jwt.split(".")[1]));
        if (payload.username) {
          setUsername(payload.username);
          // Check if JWT is expired
          const authService = new AuthService({} as any);
          if (authService.isJwtExpired(jwt)) {
            // JWT expired, show auth modal
            console.log("[App] JWT expired, showing auth modal");
            setShowAuthModal(true);
          } else {
            // JWT valid, check if we have stored OpenAI key
            console.log("[App] JWT valid, checking stored OpenAI key");
            checkStoredOpenAIKey(payload.username);
          }
        }
      } catch (error) {
        console.error("Error parsing JWT:", error);
        console.log("[App] Error parsing JWT, showing auth modal");
        setShowAuthModal(true);
      }
    } else {
      // No JWT, show auth modal
      console.log("[App] No JWT, showing auth modal");
      setShowAuthModal(true);
    }
  }, [checkStoredOpenAIKey, getStoredJwt]);

  // Get session ID for this browser session
  const sessionId = getSessionId();

  // Handle JWT expiration globally
  useJwtExpiration({
    onExpiration: () => {
      // Show a toast notification when JWT expires
      toast.error(USER_MESSAGES.SESSION_EXPIRED);
    },
  });

  // Handle authentication submission
  const handleAuthenticationSubmit = async (
    username: string,
    adminKey: string,
    openaiApiKey: string
  ) => {
    try {
      const response = await fetch("/authenticate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          adminSecret: adminKey,
          openaiApiKey,
        }),
      });

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

        // Close modal
        setShowAuthModal(false);

        toast.success("Authentication successful");
      } else {
        throw new Error(result.error || "Authentication failed");
      }
    } catch (error) {
      console.error("Error during authentication:", error);
      throw error;
    }
  };

  useEffect(() => {
    // Apply theme class on mount and when theme changes
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }

    // Save theme preference to localStorage
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  };

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
        setShowAuthModal(true);
      } else {
        console.log("[App] No authentication required in response");
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

  // Scroll to bottom on mount - only if there are messages and not loading
  useEffect(() => {
    // Scroll to bottom once when the page loads with messages
    if (agentMessages.length > 0 && !isLoading) {
      const chatContainer = document.querySelector(".overflow-y-auto");
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }
  }, [agentMessages.length, isLoading]);

  // Scroll to bottom when messages change
  useEffect(() => {
    // Only scroll when new messages are added, not on initial load
    // This will be handled by the append function instead
  }, []);

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
    setInput("");
    // Scroll to bottom after user sends a message
    setTimeout(() => {}, 100);
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
          "To upload resources to your inspiration library, look for the **'Add to library'** button in the interface. This button will open a modal where you can upload PDF files and other resources. You can also drag and drop files directly onto the upload area for a quick upload experience.";
        break;
      case "create_campaign":
        response =
          "To create a new campaign, look for the **'Create Campaign'** button. This will help you set up a new campaign with a name, description, and other details to organize your resources and planning.";
        break;
      case "start_chat":
        response =
          "You can start chatting with me right here! Just type your questions about campaign ideas, world building, character development, or any other GM topics. I'm here to help you develop your campaign ideas and provide guidance.";
        break;
      default:
        response = `I can help you with various tasks. For uploading resources, look for the 'Add to library' button. For creating campaigns, use the 'Create Campaign' button. Or just start chatting with me about your campaign ideas!`;
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
            | keyof typeof pdfTools
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
    setInput("");
    setTextareaHeight("auto"); // Reset height after submission
    // Scroll to bottom after user sends a message
    setTimeout(() => {}, 100);
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
      setTimeout(() => {}, 100);
    }
  };

  return (
    <>
      <div className="h-[100vh] w-full p-4 flex justify-center items-center bg-fixed overflow-hidden">
        <Toaster position="top-right" />
        <div className="h-[calc(100vh-2rem)] w-full mx-auto max-w-lg flex flex-col shadow-xl rounded-md overflow-hidden relative border border-neutral-300 dark:border-neutral-800">
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
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </Button>

            <Button
              variant="ghost"
              size="md"
              shape="square"
              className="rounded-full h-9 w-9"
              onClick={handleClearHistory}
            >
              <Trash size={20} />
            </Button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32 max-h-[calc(100vh-10rem)]">
            {agentMessages.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <Card className="p-6 max-w-md mx-auto bg-neutral-100 dark:bg-neutral-900">
                  <div className="text-left space-y-4">
                    <div className="bg-[#F48120]/10 text-[#F48120] rounded-full p-3 inline-flex">
                      <img
                        src={loresmith}
                        alt="LoreSmith logo"
                        width={48}
                        height={48}
                      />
                    </div>
                    <h3 className="font-semibold text-lg">
                      👋 Welcome to LoreSmith Campaign Planner!
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Speak your query, and I shall summon the most fitting
                      agent. Try:
                    </p>
                    <div className="flex justify-center gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-neutral-100 dark:bg-neutral-600"
                        onClick={() => handleSuggestionSubmit("Get started")}
                      >
                        <Lightbulb size={12} />
                        Get started
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-neutral-100 dark:bg-neutral-600"
                        onClick={() => handleSuggestionSubmit("Show agents")}
                      >
                        Show agents
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {agentMessages.map((m: Message, index) => {
              const isUser = m.role === "user";
              const showAvatar =
                index === 0 || agentMessages[index - 1]?.role !== m.role;

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
                      className={`flex gap-2 max-w-[85%] ${
                        isUser ? "flex-row-reverse" : "flex-col"
                      }`}
                    >
                      {showAvatar && !isUser ? (
                        <Avatar username={"LS"} />
                      ) : (
                        !isUser && <div className="w-8" />
                      )}

                      <div className="flex-1">
                        <div>
                          {m.parts?.map((part, i) => {
                            if (part.type === "text") {
                              return (
                                // biome-ignore lint/suspicious/noArrayIndexKey: immutable index
                                <div key={i}>
                                  <Card
                                    className={`p-3 rounded-md bg-neutral-100 dark:bg-neutral-900 ${
                                      isUser
                                        ? "rounded-br-none"
                                        : "rounded-bl-none border-assistant-border"
                                    } ${
                                      part.text.startsWith("scheduled message")
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
                                      id={`${m.id}-${i}`}
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
                                      new Date(m.createdAt as unknown as string)
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
                                    | keyof typeof pdfTools
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
          </div>

          {/* Chat-specific sections */}
          {/* PDF Upload Section */}
          <div className="px-4 py-2 border-t border-neutral-300 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
            <PdfUploadAgent />
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

      <BlockingAuthenticationModal
        isOpen={showAuthModal}
        username={username}
        storedOpenAIKey={storedOpenAIKey}
        onSubmit={handleAuthenticationSubmit}
      />
    </>
  );
}
