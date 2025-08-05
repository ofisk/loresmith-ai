import { Info } from "@phosphor-icons/react";
import type React from "react";
import { useState } from "react";
import { Input } from "./Input";

interface FormFieldProps {
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
      <Input
        id={id}
        placeholder={placeholder}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        className="w-full text-neutral-900 dark:text-white [&:-webkit-autofill]:!text-neutral-900 [&:-webkit-autofill]:!bg-neutral-900 [&:-webkit-autofill]:!shadow-[0_0_0_30px_theme(colors.neutral.900)_inset] dark:[&:-webkit-autofill]:!text-white dark:[&:-webkit-autofill]:!bg-neutral-900 dark:[&:-webkit-autofill]:!shadow-[0_0_0_30px_theme(colors.neutral.900)_inset] [&:-webkit-autofill]:![-webkit-text-fill-color:theme(colors.neutral.900)] dark:[&:-webkit-autofill]:![-webkit-text-fill-color:white]"
        style={
          {
            "--tw-text-opacity": "1",
            "--tw-bg-opacity": "1",
          } as React.CSSProperties
        }
        onKeyPress={onKeyPress}
      />
      {children}
    </div>
  );
};
