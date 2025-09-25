import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export type ChatInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> & {
  className?: string;
  multiline?: boolean;
  rows?: number;
};

export const ChatInput = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  ChatInputProps
>(({ className, multiline, rows, ...props }, ref) => {
  const baseClasses =
    "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50";
  const inputClasses =
    "h-10 file:border-0 file:bg-transparent file:text-sm file:font-medium";
  const textareaClasses = "min-h-[80px] resize-none";

  if (multiline) {
    return (
      <textarea
        ref={ref as React.Ref<HTMLTextAreaElement>}
        className={cn(baseClasses, textareaClasses, className)}
        rows={rows}
        {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
      />
    );
  }

  return (
    <input
      ref={ref as React.Ref<HTMLInputElement>}
      className={cn(baseClasses, inputClasses, className)}
      {...props}
    />
  );
});
ChatInput.displayName = "ChatInput";
