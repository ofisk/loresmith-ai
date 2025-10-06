import type { Message } from "@ai-sdk/react";
import { Card } from "@/components/card/Card";
import { MemoizedMarkdown } from "@/components/MemoizedMarkdown";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";

interface ChatMessageListProps {
  messages: Message[];
  showDebug: boolean;
  addToolResult: any;
  formatTime: (date: Date) => string;
}

export function ChatMessageList({
  messages,
  showDebug,
  addToolResult,
  formatTime,
}: ChatMessageListProps) {
  return (
    <>
      {messages
        .filter((m: Message) => {
          if (m.role === "user" && m.content === "Get started") return false;
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
                  className={`${isUser ? "flex flex-row-reverse gap-2 max-w-[85%]" : "w-full"}`}
                >
                  <div className={isUser ? "flex-1" : "w-full"}>
                    <div>
                      {m.parts?.map((part, i) => {
                        const hasTopLevelRender = false;
                        if (part.type === "text" && hasTopLevelRender) {
                          return null;
                        }
                        if (part.type === "text") {
                          return (
                            <div key={`${m.id}-text-${i}`}>
                              <Card
                                className={`p-4 rounded-xl bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur-sm ${
                                  isUser
                                    ? "rounded-br-none"
                                    : "rounded-bl-none border-assistant-border"
                                } ${
                                  part.text.startsWith("scheduled message")
                                    ? "border-accent/50"
                                    : ""
                                } relative shadow-sm border border-neutral-200/50 dark:border-neutral-700/50`}
                              >
                                {part.text.startsWith("scheduled message") && (
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
                                className={`text-xs text-muted-foreground mt-2 px-1 ${
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
                          const needsConfirmation = false; // external card will manage specifics
                          if (!showDebug) return null;
                          return (
                            <ToolInvocationCard
                              key={`${m.id}-tool-${toolCallId}-${i}`}
                              toolInvocation={toolInvocation}
                              toolCallId={toolCallId}
                              needsConfirmation={needsConfirmation as any}
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
    </>
  );
}
