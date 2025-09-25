import { Info } from "@phosphor-icons/react";
import type React from "react";
import { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";

// Internal Input component - only used by FormField
type InternalInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> & {
  children?: React.ReactNode;
  className?: string;
  displayContent?: "items-first" | "items-last";
  isValid?: boolean;
  onValueChange?: (value: string, isValid: boolean) => void;
  preText?: string[] | React.ReactNode[] | React.ReactNode;
  postText?: string[] | React.ReactNode[] | React.ReactNode;
  multiline?: boolean;
  rows?: number;
};

const InternalInput = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  InternalInputProps
>(
  (
    {
      className,
      isValid,
      onValueChange,
      onChange,
      value,
      multiline,
      rows,
      ...props
    },
    ref
  ) => {
    const baseClasses =
      "flex w-full rounded-md border border-gray-300 dark:border-gray-600 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 focus-visible:border-blue-500 dark:focus-visible:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50";
    const inputClasses =
      "h-10 file:border-0 file:bg-transparent file:text-sm file:font-medium";
    const textareaClasses = "min-h-[80px] resize-none";

    if (multiline) {
      return (
        <textarea
          ref={ref as React.Ref<HTMLTextAreaElement>}
          className={cn(baseClasses, textareaClasses, className)}
          rows={rows}
          value={value}
          onChange={(e) => {
            onValueChange?.(e.target.value, true);
            onChange?.(e as any);
          }}
          {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      );
    }

    return (
      <input
        ref={ref as React.Ref<HTMLInputElement>}
        className={cn(baseClasses, inputClasses, className)}
        value={value}
        onChange={(e) => {
          onValueChange?.(e.target.value, true);
          onChange?.(e);
        }}
        {...props}
      />
    );
  }
);
InternalInput.displayName = "InternalInput";

interface FormFieldProps
  extends Omit<
    InternalInputProps,
    "id" | "value" | "onValueChange" | "className"
  > {
  id: string;
  label: string;
  placeholder?: string;
  value: string;
  onValueChange: (value: string, isValid: boolean) => void;
  disabled?: boolean;
  className?: string;
  onKeyPress?: (event: React.KeyboardEvent) => void;
  children?: React.ReactNode; // For additional content like tags display
  tooltip?: React.ReactNode; // Optional tooltip content
}

export const FormField: React.FC<FormFieldProps> = ({
  id,
  label,
  placeholder,
  value,
  onValueChange,
  disabled = false,
  className = "",
  onKeyPress,
  children,
  tooltip,
  ...inputProps
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-2">
        <label htmlFor={id} className="text-ob-base-300 text-sm font-medium">
          {label}
        </label>
        {tooltip && (
          <button
            type="button"
            className="relative"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onFocus={() => setShowTooltip(true)}
            onBlur={() => setShowTooltip(false)}
          >
            <Info
              size={16}
              className="text-ob-base-200 hover:text-ob-base-300 cursor-help transition-colors select-none"
              weight="regular"
            />
            {showTooltip && (
              <div className="absolute z-50 left-full ml-2 top-0">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 text-sm shadow-xl w-80">
                  {tooltip}
                  <div className="absolute top-3 -left-2 w-0 h-0 border-t-2 border-b-2 border-r-2 border-transparent border-r-white dark:border-r-gray-800"></div>
                </div>
              </div>
            )}
          </button>
        )}
      </div>
      <InternalInput
        id={id}
        placeholder={placeholder}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        className="w-full"
        style={
          {
            "--tw-text-opacity": "1",
            "--tw-bg-opacity": "1",
          } as React.CSSProperties
        }
        onKeyPress={onKeyPress}
        {...inputProps}
      />
      {children}
    </div>
  );
};
