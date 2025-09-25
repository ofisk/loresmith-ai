import type { Message } from "@ai-sdk/react";
import { Card } from "@/components/card/Card";
import { MemoizedMarkdown } from "@/components/MemoizedMarkdown";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";
import { ShardManagementUI } from "./ShardManagementUI";

interface ChatMessageListProps {
  messages: Message[];
  showDebug: boolean;
  shouldRenderShardUI: (campaignId?: string) => boolean;
  addToolResult: any;
  formatTime: (date: Date) => string;
}

export function ChatMessageList({
  messages,
  showDebug,
  shouldRenderShardUI,
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
                      {(() => {
                        const topLevelData: any = (m as any)?.data;
                        if (
                          topLevelData?.type === "ui_hint" &&
                          topLevelData?.hint?.type === "shards_ready"
                        ) {
                          const cid = topLevelData?.hint?.data?.campaignId as
                            | string
                            | undefined;
                          if (!shouldRenderShardUI(cid)) return null;
                          const Comp = ShardManagementUI;
                          const groups = topLevelData.hint.data.groups || [];
                          const total = Array.isArray(groups)
                            ? groups.reduce(
                                (t: number, g: any) =>
                                  t + (g?.shards?.length || 0),
                                0
                              )
                            : 0;
                          return (
                            <div
                              key={`${m.id}-render-top-uihint`}
                              className="w-full"
                            >
                              <Comp
                                campaignId={cid!}
                                resourceId={topLevelData.hint.data.resourceId}
                                shards={groups}
                                total={total}
                                action="show_staged"
                              />
                            </div>
                          );
                        }
                        return null;
                      })()}
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
