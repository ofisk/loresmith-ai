import type { Message } from "@ai-sdk/react";
// Icon imports
import {
  Bug,
  Moon,
  PaperPlaneTilt,
  Stop,
  Sun,
  Trash,
} from "@phosphor-icons/react";
import { Lightbulb } from "@phosphor-icons/react/dist/ssr";
import { useAgentChat } from "agents/ai-react";
import { useAgent } from "agents/react";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import loresmith from "@/assets/loresmith.png";
import { Avatar } from "@/components/avatar/Avatar";
// Component imports
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { PdfUploadAgent } from "@/components/pdf-upload/PdfUploadAgent";
import { Textarea } from "@/components/textarea/Textarea";
import { Toggle } from "@/components/toggle/Toggle";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";
import type { tools } from "./tools";
import type { campaignTools } from "./tools/campaignTools";
import type { pdfTools } from "./tools/pdfTools";
import { useJwtExpiration } from "./hooks/useJwtExpiration";
import { USER_MESSAGES } from "./constants";

// List of tools that require human confirmation
// NOTE: this should match the keys in the executions object in tools.ts
const toolsRequiringConfirmation: (
  | keyof typeof tools
  | keyof typeof campaignTools
  | keyof typeof pdfTools
)[] = [
  // Campaign tools that require confirmation
  "createCampaign",

  // Resource/PDF tools that require confirmation
  "uploadPdfFile",
  "updatePdfMetadata",
  "ingestPdfFile",

  // General tools that require confirmation
  "scheduleTask",
  "cancelScheduledTask",
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get session ID for this browser session
  const sessionId = getSessionId();

  // Get stored JWT for PDF operations
  const getStoredJwt = (): string | null => {
    const jwt = localStorage.getItem("pdf_auth_jwt");
    console.log("[App] getStoredJwt() returns:", jwt);
    return jwt;
  };

  // Handle JWT expiration globally
  useJwtExpiration({
    onExpiration: () => {
      // Show a toast notification when JWT expires
      toast.error(USER_MESSAGES.SESSION_EXPIRED);
    },
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

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

  // Scroll to bottom on mount
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

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
  });

  // Function to handle suggested prompts
  const handleSuggestionSubmit = (suggestion: string) => {
    const jwt = getStoredJwt();
    console.log("[App] handleSuggestionSubmit sending JWT:", jwt);
    append({
      role: "user",
      content: suggestion,
      data: jwt ? { jwt } : undefined,
    });
    setInput("");
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

  // Scroll to bottom when messages change
  useEffect(() => {
    agentMessages.length > 0 && scrollToBottom();
  }, [agentMessages, scrollToBottom]);

  const pendingToolCallConfirmation = agentMessages.some((m: Message) =>
    m.parts?.some(
      (part) =>
        part.type === "tool-invocation" &&
        part.toolInvocation.state === "call" &&
        toolsRequiringConfirmation.includes(
          part.toolInvocation.toolName as keyof typeof tools
        )
    )
  );

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Enhanced form submission handler that includes JWT
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const jwt = getStoredJwt();
    console.log("[App] handleFormSubmit sending JWT:", jwt);
    append({
      role: "user",
      content: agentInput,
      data: jwt ? { jwt } : undefined,
    });
    setInput("");
    setTextareaHeight("auto"); // Reset height after submission
  };

  // Enhanced key down handler that includes JWT
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const jwt = getStoredJwt();
      console.log("[App] handleKeyDown sending JWT:", jwt);
      append({
        role: "user",
        content: agentInput,
        data: jwt ? { jwt } : undefined,
      });
      setInput("");
      setTextareaHeight("auto"); // Reset height on Enter submission
    }
  };

  return (
    <div className="h-[100vh] w-full p-4 flex justify-center items-center bg-white dark:bg-neutral-900 overflow-hidden">
      <Toaster position="top-right" />
      <HasOpenAIKey />
      <div className="h-[calc(100vh-2rem)] w-full mx-auto max-w-lg flex flex-col shadow-xl rounded-md overflow-hidden relative border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
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
            <h2 className="font-semibold text-base">LoreSmith MCP Router</h2>
          </div>

          <div className="flex items-center gap-2 mr-2">
            <Bug size={16} />
            <Toggle
              toggled={showDebug}
              aria-label="Toggle debug mode"
              onClick={() => setShowDebug((prev) => !prev)}
            />
          </div>

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
                    👋 Welcome to LoreSmith MCP Router!
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Speak your query, and I shall summon the most fitting agent.
                    Try:
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
                    {JSON.stringify(m, null, 2)}
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
                                toolInvocation.toolName as keyof typeof tools
                              );

                            // Skip rendering the card in debug mode
                            if (showDebug) return null;

                            return (
                              <ToolInvocationCard
                                // biome-ignore lint/suspicious/noArrayIndexKey: using index is safe here as the array is static
                                key={`${toolCallId}-${i}`}
                                toolInvocation={toolInvocation}
                                toolCallId={toolCallId}
                                needsConfirmation={needsConfirmation}
                                addToolResult={addToolResult}
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
          <div ref={messagesEndRef} />
        </div>

        {/* Chat-specific sections */}
        {/* PDF Upload Section */}
        <div className="px-4 py-2 border-t border-neutral-300 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
          <PdfUploadAgent messages={agentMessages} append={append} />
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
                    disabled={pendingToolCallConfirmation || !agentInput.trim()}
                    aria-label="Send message"
                  >
                    <PaperPlaneTilt size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

const hasOpenAiKeyPromise = fetch("/check-open-ai-key").then((res) =>
  res.json<{ success: boolean }>()
);

function HasOpenAIKey() {
  const hasOpenAiKey = use(hasOpenAiKeyPromise);

  if (!hasOpenAiKey.success) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-red-500/10 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-lg border border-red-200 dark:border-red-900 p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                <svg
                  className="w-5 h-5 text-red-600 dark:text-red-400"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-labelledby="warningIcon"
                >
                  <title id="warningIcon">Warning Icon</title>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
                  OpenAI API Key Not Configured
                </h3>
                <p className="text-neutral-600 dark:text-neutral-300 mb-1">
                  Requests to the API, including from the frontend UI, will not
                  work until an OpenAI API key is configured.
                </p>
                <p className="text-neutral-600 dark:text-neutral-300">
                  Please configure an OpenAI API key by setting a{" "}
                  <a
                    href="https://developers.cloudflare.com/workers/configuration/secrets/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-red-600 dark:text-red-400"
                  >
                    secret
                  </a>{" "}
                  named{" "}
                  <code className="bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded text-red-600 dark:text-red-400 font-mono text-sm">
                    OPENAI_API_KEY
                  </code>
                  . <br />
                  You can also use a different model provider by following these{" "}
                  <a
                    href="https://github.com/cloudflare/agents-starter?tab=readme-ov-file#use-a-different-ai-model-provider"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-red-600 dark:text-red-400"
                  >
                    instructions.
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
