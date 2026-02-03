import type { Message } from "@/types/ai-message";
import { Card } from "@/components/card/Card";
import { MemoizedMarkdown } from "@/components/MemoizedMarkdown";

interface ChatMessageListProps {
  messages: Message[];
  formatTime: (date: Date) => string;
}

export function ChatMessageList({
  messages,
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
              <div
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`${isUser ? "flex flex-row-reverse gap-2 max-w-[85%]" : "w-full"}`}
                >
                  <div className={isUser ? "flex-1" : "w-full"}>
                    <div>
                      {(() => {
                        // Find the index of the last text part in the original parts array
                        const parts = m.parts || [];
                        let lastTextPartIndex = -1;
                        for (let j = parts.length - 1; j >= 0; j--) {
                          if (parts[j]?.type === "text") {
                            lastTextPartIndex = j;
                            break;
                          }
                        }

                        return parts.map((part, i) => {
                          const hasTopLevelRender = false;
                          if (part.type === "text" && hasTopLevelRender) {
                            return null;
                          }
                          if (
                            part.type === "text" &&
                            typeof part.text === "string"
                          ) {
                            const isLastTextPart = i === lastTextPartIndex;

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
                                {isLastTextPart &&
                                  (() => {
                                    const createdAt = m.createdAt as
                                      | string
                                      | Date
                                      | undefined;
                                    const date =
                                      createdAt != null
                                        ? new Date(createdAt)
                                        : null;
                                    const isValid =
                                      date != null &&
                                      !Number.isNaN(date.getTime());
                                    return isValid ? (
                                      <p
                                        className={`text-xs text-muted-foreground mt-2 px-1 ${
                                          isUser ? "text-right" : "text-left"
                                        }`}
                                      >
                                        {formatTime(date)}
                                      </p>
                                    ) : null;
                                  })()}
                              </div>
                            );
                          }

                          return null;
                        });
                      })()}
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
