import { PaperPlaneRight, Stop } from "@phosphor-icons/react";
import { Textarea } from "../textarea/Textarea";

interface ChatInputProps {
  agentInput: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleFormSubmit: (e: React.FormEvent) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  pendingToolCallConfirmation: boolean;
  isLoading: boolean;
  stop: () => void;
  textareaHeight: string;
  setTextareaHeight: (height: string) => void;
}

export function ChatInput({
  agentInput,
  handleInputChange,
  handleFormSubmit,
  handleKeyDown,
  pendingToolCallConfirmation,
  isLoading,
  stop,
  textareaHeight,
  setTextareaHeight,
}: ChatInputProps) {
  return (
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
              handleInputChange(e);
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
                <PaperPlaneRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
