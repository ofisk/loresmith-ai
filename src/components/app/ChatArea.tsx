import type { Message } from "@ai-sdk/react";
import { PaperPlaneRight, Stop } from "@phosphor-icons/react";
import type React from "react";
import { Card } from "@/components/card/Card";
import { ChatInput } from "@/components/input/ChatInput";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { ThinkingSpinner } from "@/components/thinking-spinner";
import { WelcomeMessage } from "@/components/chat/WelcomeMessage";

interface ChatAreaProps {
  chatContainerId: string;
  messages: Message[];
  input: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onFormSubmit: (e: React.FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isLoading: boolean;
  onStop: () => void;
  showDebug: boolean;
  addToolResult: (args: { toolCallId: string; result: unknown }) => void;
  formatTime: (date: Date) => string;
  onSuggestionSubmit: (suggestion: string) => void;
  onUploadFiles: () => void;
  textareaHeight: string;
  onTextareaHeightChange: (height: string) => void;
  pendingToolCallConfirmation: boolean;
}

/**
 * ChatArea component - Main chat interface with messages and input
 */
export function ChatArea({
  chatContainerId,
  messages,
  input,
  onInputChange,
  onFormSubmit,
  onKeyDown,
  isLoading,
  onStop,
  showDebug,
  addToolResult,
  formatTime,
  onSuggestionSubmit,
  onUploadFiles,
  textareaHeight,
  onTextareaHeightChange,
  pendingToolCallConfirmation,
}: ChatAreaProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Main Content Area */}
      <div
        id={chatContainerId}
        className="flex-1 overflow-y-auto px-8 py-6 space-y-6 pb-6 min-h-0"
      >
        {messages.length === 0 && (
          <WelcomeMessage
            onSuggestionSubmit={onSuggestionSubmit}
            onUploadFiles={onUploadFiles}
          />
        )}

        <ChatMessageList
          messages={messages}
          showDebug={showDebug}
          addToolResult={addToolResult}
          formatTime={formatTime}
        />

        {/* Thinking Spinner - shown when agent is processing */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="w-full">
              <Card className="p-4 rounded-xl bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-bl-none border-assistant-border shadow-sm border border-neutral-200/50 dark:border-neutral-700/50">
                <ThinkingSpinner />
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <form
        onSubmit={onFormSubmit}
        className="p-6 bg-neutral-50/50 border-t border-neutral-200 dark:border-neutral-700 dark:bg-neutral-900/50 backdrop-blur-sm"
      >
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <ChatInput
              disabled={pendingToolCallConfirmation}
              placeholder={
                pendingToolCallConfirmation
                  ? "Please respond to the tool confirmation above..."
                  : "What knowledge do you seek today?"
              }
              className="flex w-full border border-neutral-200/50 dark:border-neutral-700/50 px-4 py-3 text-base placeholder:text-neutral-500 dark:placeholder:text-neutral-400 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl !text-base pb-12 dark:bg-neutral-900/80 backdrop-blur-sm shadow-sm"
              value={input}
              onChange={
                onInputChange as unknown as React.ChangeEventHandler<HTMLInputElement>
              }
              onKeyDown={onKeyDown}
              multiline
              rows={2}
              style={{ height: textareaHeight }}
            />
            <div className="absolute bottom-1 right-1 p-2 w-fit flex flex-row justify-end">
              {isLoading ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-2 h-fit border border-neutral-200/50 dark:border-neutral-700/50 shadow-sm backdrop-blur-sm"
                  aria-label="Stop generation"
                >
                  <Stop size={16} />
                </button>
              ) : (
                <button
                  type="submit"
                  className="inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-2 h-fit border border-neutral-200/50 dark:border-neutral-700/50 shadow-sm backdrop-blur-sm"
                  disabled={pendingToolCallConfirmation || !input.trim()}
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
  );
}
