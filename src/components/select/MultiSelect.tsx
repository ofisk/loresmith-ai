import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

export type MultiSelectOption = {
  value: string;
  label: string;
};

export type MultiSelectProps = {
  className?: string;
  options: MultiSelectOption[];
  placeholder?: string;
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  size?: "sm" | "md" | "base";
  /** If true, the dropdown closes after each selection change */
  closeOnSelect?: boolean;
};

export const MultiSelect = ({
  className,
  options,
  placeholder = "Select options...",
  selectedValues,
  onSelectionChange,
  size = "base",
  closeOnSelect = false,
}: MultiSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (value: string) => {
    const newSelection = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value];
    onSelectionChange(newSelection);
    if (closeOnSelect) {
      setIsOpen(false);
    }
  };

  const selectedLabels = options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label)
    .join(", ");

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "btn btn-secondary interactive relative appearance-none truncate bg-no-repeat focus:outline-none w-full text-left",
          {
            "add-size-sm !pr-6.5": size === "sm",
            "add-size-md !pr-8": size === "md",
            "add-size-base !pr-9": size === "base",
          }
        )}
        style={{
          backgroundImage: "url(/assets/caret.svg)",
          backgroundPosition: `calc(100% - ${size === "base" ? "10px" : size === "md" ? "8px" : "6px"}) calc(100% / 2)`,
          backgroundSize:
            size === "base" ? "16px" : size === "md" ? "14px" : "12px",
        }}
      >
        {selectedValues.length > 0 ? selectedLabels : placeholder}
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex items-center px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(option.value)}
                onChange={() => toggleOption(option.value)}
                className="mr-2"
              />
              <span className="text-sm">{option.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
