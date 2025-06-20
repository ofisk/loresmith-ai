import { useEffect, useState, useRef, useCallback, use } from "react";
import type { Message } from "@ai-sdk/react";
import type { tools } from "./tools";

// Component imports
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Avatar } from "@/components/avatar/Avatar";
import { Toggle } from "@/components/toggle/Toggle";
import { Textarea } from "@/components/textarea/Textarea";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";
import { PdfUpload } from "@/components/pdf-upload/PdfUpload";
import { AgentProvider } from "@/contexts/AgentContext";
import { useAgentChat } from "agents/ai-react";


// Icon imports
import {
  Bug,
  Moon,
  Sun,
  Trash,
  PaperPlaneTilt,
  Stop,
  Lightbulb,
} from "@phosphor-icons/react";
import loresmith from "@/assets/loresmith.png";

// List of tools that require human confirmation
// NOTE: this should match the keys in the executions object in tools.ts
const toolsRequiringConfirmation: (keyof typeof tools)[] = [
  "getWeatherInformation",
];

/**
 * Generate a unique session ID for this browser session
 * This will be used to create a unique Durable Object ID for each session
 */
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get or create a session ID, persisting it in sessionStorage
 * This ensures the same session ID is used for the duration of the browser session
 */
function getSessionId(): string {
  const existingSessionId = sessionStorage.getItem("chat-session-id");
  if (existingSessionId) {
    return existingSessionId;
  }

  const newSessionId = generateSessionId();
  sessionStorage.setItem("chat-session-id", newSessionId);
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
  const [adminSecret, setAdminSecret] = useState<string>(() => {
    // Get admin secret from sessionStorage
    return sessionStorage.getItem("pdf-admin-secret") || "";
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get session ID for this browser session
  const sessionId = getSessionId();

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

  return (
    <AgentProvider sessionId={sessionId}>
      <ChatContent
        theme={theme}
        showDebug={showDebug}
        textareaHeight={textareaHeight}
        adminSecret={adminSecret}
        setAdminSecret={setAdminSecret}
        messagesEndRef={messagesEndRef}
        scrollToBottom={scrollToBottom}
        toggleTheme={toggleTheme}
        setShowDebug={setShowDebug}
        setTextareaHeight={setTextareaHeight}
      />
    </AgentProvider>
  );
}

function ChatContent({
  theme,
  showDebug,
  textareaHeight,
  adminSecret,
  setAdminSecret,
  messagesEndRef,
  scrollToBottom,
  toggleTheme,
  setShowDebug,
  setTextareaHeight,
}: {
  theme: "dark" | "light";
  showDebug: boolean;
  textareaHeight: string;
  adminSecret: string;
  setAdminSecret: (secret: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  scrollToBottom: () => void;
  toggleTheme: () => void;
  setShowDebug: (show: boolean) => void;
  setTextareaHeight: (height: string) => void;
}) {
  const {
    messages: agentMessages,
    input: agentInput,
    handleInputChange: handleAgentInputChange,
    handleSubmit: handleAgentSubmit,
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
    append({
      role: "user",
      content: suggestion,
    });
    setInput("");
  };

  // Enhanced clear history function that creates a new session
  const handleClearHistory = () => {
    clearHistory();
    // Optionally create a new session ID when clearing history
    // This creates a completely fresh chat session
    const newSessionId = generateSessionId();
    sessionStorage.setItem("chat-session-id", newSessionId);
    // Reload the page to reinitialize with the new session ID
    window.location.reload();
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    agentMessages.length > 0 && scrollToBottom();
  }, [agentMessages, scrollToBottom]);

  // Check for admin secret verification from tool results
  useEffect(() => {
    if (!adminSecret && agentMessages.length > 0) {
      // Look for successful setAdminSecret tool invocation
      for (const message of agentMessages) {
        if (message.parts) {
          for (const part of message.parts) {
            if (
              part.type === "tool-invocation" &&
              part.toolInvocation.toolName === "setAdminSecret" &&
              part.toolInvocation.state === "result"
            ) {
              const result = part.toolInvocation.result;
              try {
                // Parse JSON response
                const parsedResult = JSON.parse(result);
                if (parsedResult.status === "SUCCESS" && parsedResult.secret) {
                  setAdminSecret(parsedResult.secret);
                  sessionStorage.setItem(
                    "pdf-admin-secret",
                    parsedResult.secret
                  );
                  return;
                }
              } catch (error) {
                // If JSON parsing fails, ignore this result
                console.warn(
                  "Failed to parse setAdminSecret result as JSON:",
                  error
                );
              }
            }
          }
        }
      }
    }
  }, [agentMessages, adminSecret]);

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

  return (
    <div className="h-[100vh] w-full p-4 flex justify-center items-center bg-fixed overflow-hidden">
      <HasOpenAIKey />
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
            <h2 className="font-semibold text-base">LoreSmith MCP Router</h2>
          </div>

          <div className="flex items-center gap-2 mr-2">
            <Bug size={16} />
            <Toggle
              toggled={showDebug}
              aria-label="Toggle debug mode"
              onClick={() => setShowDebug(!showDebug)}
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

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 max-h-[calc(100vh-10rem)]">
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
                      isUser ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    {showAvatar && !isUser ? (
                      <Avatar username={"AI"} />
                    ) : (
                      !isUser && <div className="w-8" />
                    )}

                    <div>
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
                                    content={part.text
                                      .replace(/^scheduled message: /, "")
                                      .replace(/^SECRET_VERIFIED:[^:]+:/, "")}
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

                            // Render requestAdminSecret and setAdminSecret results as regular text messages
                            if (
                              (toolInvocation.toolName ===
                                "requestAdminSecret" ||
                                toolInvocation.toolName === "setAdminSecret") &&
                              toolInvocation.state === "result"
                            ) {
                              return (
                                // biome-ignore lint/suspicious/noArrayIndexKey: immutable index
                                <div key={i}>
                                  <Card
                                    className={`p-3 rounded-md bg-neutral-100 dark:bg-neutral-900 rounded-bl-none border-assistant-border`}
                                  >
                                    <MemoizedMarkdown
                                      id={`${m.id}-${i}`}
                                      content={(() => {
                                        try {
                                          const parsedResult = JSON.parse(
                                            toolInvocation.result
                                          );
                                          const message =
                                            parsedResult.message ||
                                            toolInvocation.result;
                                          return message;
                                        } catch {
                                          return toolInvocation.result;
                                        }
                                      })()}
                                    />
                                  </Card>
                                  <p className="text-xs text-muted-foreground mt-1 text-left">
                                    {formatTime(
                                      new Date(m.createdAt as unknown as string)
                                    )}
                                  </p>
                                </div>
                              );
                            }

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

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 z-10 border-t border-neutral-300 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
          {/* File Upload Component */}
          <div className="p-3 border-b border-neutral-200 dark:border-neutral-700">
            <PdfUpload
              adminSecret={adminSecret}
              onUploadStart={(files) => {
                // Add a message to the chat when upload starts
                const fileNames = files.map((f) => f.name).join(", ");
                // We could add this to the conversation if needed
                console.log(`Starting upload of: ${fileNames}`);
              }}
              onFileUploadComplete={(file, result) => {
                // Add a success message to the chat
                console.log(`Upload completed: ${file.name}`, result);
              }}
              onUploadError={(error) => {
                if (
                  error.includes("Unauthorized") ||
                  error.includes("Admin secret")
                ) {
                  const newSecret = prompt(
                    "🧙‍♂️ Speak the Sacred Incantation (admin secret) to access the mystical archive:"
                  );
                  if (newSecret) {
                    setAdminSecret(newSecret);
                    sessionStorage.setItem("pdf-admin-secret", newSecret);
                  }
                }
              }}
            />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAgentSubmit(e, {});
              setTextareaHeight("auto"); // Reset height after submission
            }}
            className="p-3"
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
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      handleAgentSubmit(e as unknown as React.FormEvent);
                      setTextareaHeight("auto"); // Reset height on Enter submission
                    }
                  }}
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
                      <PaperPlaneTilt size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>
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
