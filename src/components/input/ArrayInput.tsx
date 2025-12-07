import { X, Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ArrayInputProps {
  label?: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  tooltip?: React.ReactNode;
}

export function ArrayInput({
  label,
  values,
  onChange,
  placeholder = "Add item...",
  className = "",
  disabled = false,
  tooltip,
}: ArrayInputProps) {
  const [newItem, setNewItem] = useState("");

  const addItem = () => {
    const trimmed = newItem.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
      setNewItem("");
    }
  };

  const removeItem = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addItem();
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
          </div>
          {tooltip && (
            <div className="relative group">
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 text-sm shadow-xl w-80">
                  {tooltip}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white dark:border-t-gray-800"></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="space-y-2">
        {values.map((value, index) => (
          <div
            key={`${value}-${index}`}
            className="flex items-center justify-between gap-2 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-800"
          >
            <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">
              {value}
            </span>
            <button
              type="button"
              onClick={() => removeItem(index)}
              disabled={disabled}
              className="text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-background text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 focus-visible:border-blue-500 dark:focus-visible:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          onClick={addItem}
          disabled={disabled || !newItem.trim()}
          className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <Plus size={16} />
          <span className="text-sm">Add</span>
        </button>
      </div>
    </div>
  );
}
