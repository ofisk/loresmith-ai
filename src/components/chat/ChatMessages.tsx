import type { Message } from "@ai-sdk/react";
import { Card } from "@/components/card/Card";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";
import type { campaignTools } from "@/tools/campaign";
import type { fileTools } from "@/tools/file";
import type { generalTools } from "@/tools/general";

interface ChatMessagesProps {
  messages: Message[];
  showDebug: boolean;
  toolsRequiringConfirmation: (
    | keyof typeof generalTools
    | keyof typeof campaignTools
    | keyof typeof fileTools
  )[];
  addToolResult: (args: { toolCallId: string; result: any }) => void;
}

export function ChatMessages({
  messages,
  showDebug,
  toolsRequiringConfirmation,
  addToolResult,
}: ChatMessagesProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      {messages
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
                              addToolResult={(args) => addToolResult(args)}
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
