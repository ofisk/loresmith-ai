import type { Message } from "@/types/ai-message";
import { PaperPlaneRight, Stop } from "@phosphor-icons/react";
import type React from "react";
import { useState } from "react";
import { Card } from "@/components/card/Card";
import { ChatInput } from "@/components/input/ChatInput";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { ThinkingSpinner } from "@/components/thinking-spinner";
import { WelcomeMessage } from "@/components/chat/WelcomeMessage";
import type { Campaign } from "@/types/campaign";

const CHAT_PROMPTS = [
  "Need some lore?",
  "Consult the archives?",
  "What's on your mind?",
  "What can I help with?",
];

const getRandomPrompt = () =>
  CHAT_PROMPTS[Math.floor(Math.random() * CHAT_PROMPTS.length)];

interface ChatAreaProps {
  chatContainerId: string;
  messages: Message[];
  /** True while persisted chat history is being loaded (e.g. on page load). */
  chatHistoryLoading?: boolean;
  input: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onFormSubmit: (e: React.FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isLoading: boolean;
  onStop: () => void;
  formatTime: (date: Date) => string;
  onSuggestionSubmit: (suggestion: string) => void;
  onUploadFiles: () => void;
  textareaHeight: string;
  pendingToolCallConfirmation: boolean;
  campaigns: Campaign[];
  selectedCampaignId: string | null;
  onSelectedCampaignChange: (campaignId: string | null) => void;
  /** User message contents to hide (e.g. button-triggered prompts). */
  invisibleUserContents?: Set<string>;
}

/**
 * ChatArea component - Main chat interface with messages, campaign context, and input
 */
export function ChatArea({
  chatContainerId,
  messages,
  chatHistoryLoading = false,
  input,
  onInputChange,
  onFormSubmit,
  onKeyDown,
  isLoading,
  onStop,
  formatTime,
  onSuggestionSubmit,
  onUploadFiles,
  textareaHeight,
  pendingToolCallConfirmation,
  campaigns,
  selectedCampaignId,
  onSelectedCampaignChange,
  invisibleUserContents,
}: ChatAreaProps) {
  const [placeholder] = useState(() => getRandomPrompt());

  const handleCampaignChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = event.target.value;
    if (!value) {
      onSelectedCampaignChange(null);
    } else {
      onSelectedCampaignChange(value);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Campaign Context Selector - separate div above chat */}
      <div className="px-8 py-3 flex-shrink-0">
        <select
          id="campaign-select"
          className="tour-campaign-selector rounded-md border border-neutral-300 bg-purple-600/10 px-3 py-1.5 text-sm text-neutral-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-600 dark:border-neutral-700 dark:bg-purple-400/10 dark:text-neutral-100 dark:focus:ring-purple-400"
          value={selectedCampaignId ?? ""}
          onChange={handleCampaignChange}
        >
          <option value="">No campaign selected</option>
          {campaigns.map((campaign) => (
            <option key={campaign.campaignId} value={campaign.campaignId}>
              {campaign.name}
            </option>
          ))}
        </select>
      </div>

      {/* Main Content Area */}
      <div
        id={chatContainerId}
        className="flex-1 overflow-y-auto px-8 py-6 space-y-6 pb-12 min-h-0"
      >
        {messages.length === 0 && !chatHistoryLoading && (
          <WelcomeMessage
            onSuggestionSubmit={onSuggestionSubmit}
            onUploadFiles={onUploadFiles}
          />
        )}
        {messages.length === 0 && chatHistoryLoading && (
          <div className="flex items-center justify-center py-12 text-neutral-500 dark:text-neutral-400">
            Loading conversation...
          </div>
        )}

        <ChatMessageList
          messages={messages}
          formatTime={formatTime}
          invisibleUserContents={invisibleUserContents}
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
        className="chat-input-area px-4 pt-3 pb-8 bg-neutral-50/50 dark:bg-neutral-900/50 backdrop-blur-sm rounded-br-2xl"
      >
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <ChatInput
              disabled={pendingToolCallConfirmation}
              placeholder={
                pendingToolCallConfirmation
                  ? "Please respond to the tool confirmation above..."
                  : placeholder
              }
              className="flex w-full border border-neutral-200/50 dark:border-neutral-700/50 px-3 py-2 text-base placeholder:text-neutral-500 dark:placeholder:text-neutral-400 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm min-h-[40px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl !text-base pb-10 dark:bg-neutral-900/80 backdrop-blur-sm shadow-sm"
              value={input}
              onChange={
                onInputChange as unknown as React.ChangeEventHandler<HTMLInputElement>
              }
              onKeyDown={onKeyDown}
              multiline
              rows={1}
              style={{ height: textareaHeight }}
            />
            <div className="absolute bottom-1 right-1 p-1.5 w-fit flex flex-row justify-end">
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
                  disabled={
                    pendingToolCallConfirmation || !(input ?? "").trim()
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
  );
}
