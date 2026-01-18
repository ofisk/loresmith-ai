import type React from "react";
import { useState, useRef, useEffect } from "react";
import { Plus, Trash2, X } from "lucide-react";

interface PropertyFieldProps {
  name: string;
  value: unknown;
  type: "string" | "number" | "array" | "object";
  editable?: boolean;
  onChange?: (key: string, newValue: unknown) => void;
  onDelete?: (key: string) => void;
  className?: string;
}

export function PropertyField({
  name,
  value,
  type,
  editable = true,
  onChange,
  onDelete,
  className = "",
}: PropertyFieldProps) {
  // Certain fields should never be editable
  const isFieldEditable =
    editable && !["confidence", "type", "id", "source"].includes(name);
  const [editValue, setEditValue] = useState<unknown>(value);
  const [newArrayItem, setNewArrayItem] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEditingRef = useRef(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  // Sync editValue with value prop when it changes externally, but only if not currently editing
  useEffect(() => {
    if (!isEditingRef.current) {
      setEditValue(value);
    }
  }, [value]);

  useEffect(() => {
    if (isFieldEditable) {
      isEditingRef.current = true; // Mark as editing when field becomes editable
      // Don't auto-focus/select fields when they become editable
    } else {
      isEditingRef.current = false; // Not editing when field is not editable
    }
  }, [isFieldEditable]);

  const handleSave = () => {
    isEditingRef.current = false;
    if (onChange) {
      onChange(name, editValue);
    }
  };

  const handleCancel = () => {
    isEditingRef.current = false;
    setEditValue(value as unknown);
  };

  const handleFocus = () => {
    isEditingRef.current = true;
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Don't cancel if clicking on save/cancel buttons
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (buttonRef.current?.contains(relatedTarget)) {
      return;
    }
    // On blur, cancel any unsaved changes to prevent state corruption
    handleCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  const addArrayItem = () => {
    if (newArrayItem.trim() && Array.isArray(editValue)) {
      let itemToAdd: any = newArrayItem.trim();

      // Try to parse as JSON if it looks like an object
      if (
        newArrayItem.trim().startsWith("{") ||
        newArrayItem.trim().startsWith("[")
      ) {
        try {
          itemToAdd = JSON.parse(newArrayItem.trim());
        } catch {
          // If JSON parsing fails, keep as string
          itemToAdd = newArrayItem.trim();
        }
      }

      const updatedArray = [...editValue, itemToAdd];
      setEditValue(updatedArray);
      setNewArrayItem("");
    }
  };

  const removeArrayItem = (index: number) => {
    if (Array.isArray(editValue)) {
      const updatedArray = editValue.filter((_, i) => i !== index);
      setEditValue(updatedArray);
    }
  };

  const formatValue = (val: any): string => {
    if (Array.isArray(val)) {
      return val.join(", ");
    }
    if (typeof val === "object" && val !== null) {
      return JSON.stringify(val, null, 2);
    }
    // For string values, try parsing as JSON to extract text content
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        // If it's an object with a "text" field, extract and display just that text
        if (
          parsed &&
          typeof parsed === "object" &&
          parsed.text &&
          typeof parsed.text === "string"
        ) {
          return parsed.text;
        }
        // Otherwise return the original string
        return val;
      } catch {
        // Not JSON, return as-is
        return val;
      }
    }
    return String(val);
  };

  const fieldId = `property-field-${String(name)
    .replace(/\s+/g, "-")
    .toLowerCase()}`;

  const renderValue = () => {
    if (isFieldEditable) {
      switch (type) {
        case "number":
          return (
            <input
              ref={inputRef}
              type="number"
              value={
                typeof editValue === "number"
                  ? editValue
                  : Number(editValue) || 0
              }
              onChange={(e) => setEditValue(Number(e.target.value))}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              id={fieldId}
              className="w-full px-2 py-1 border border-gray-600 rounded text-sm bg-gray-700 text-white focus:border-purple-500 focus:ring-purple-500"
            />
          );

        case "array":
          return (
            <div className="space-y-2">
              <div className="space-y-2">
                {Array.isArray(editValue) &&
                  editValue.map((item, index) => (
                    <div
                      key={`${String(item)}-${index}`}
                      className="inline-flex items-center gap-2 px-2 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded text-xs"
                    >
                      {typeof item === "object" && item !== null ? (
                        <span>{JSON.stringify(item)}</span>
                      ) : (
                        <span>{String(item)}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeArrayItem(index)}
                        className="hover:text-red-600 dark:hover:text-red-400 transition-colors flex-shrink-0"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newArrayItem}
                  onChange={(e) => setNewArrayItem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addArrayItem()}
                  placeholder="Add tag"
                  className="flex-1 px-2 py-1 border border-gray-600 rounded text-sm bg-gray-700 text-white placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={addArrayItem}
                  className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          );

        case "object":
          return (
            <textarea
              ref={textareaRef}
              value={JSON.stringify(editValue, null, 2)}
              onChange={(e) => {
                try {
                  setEditValue(JSON.parse(e.target.value));
                } catch {
                  // Invalid JSON, keep the text for user to fix
                }
              }}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              id={fieldId}
              className="w-full px-2 py-1 border border-gray-600 rounded text-sm font-mono bg-gray-700 text-white focus:border-purple-500 focus:ring-purple-500"
              rows={4}
            />
          );

        default: // string
          return (
            <input
              ref={inputRef}
              type="text"
              value={
                typeof editValue === "string"
                  ? editValue
                  : String(editValue || "")
              }
              onChange={(e) => setEditValue(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              id={fieldId}
              className="w-full px-2 py-1 border border-gray-600 rounded text-sm bg-gray-700 text-white focus:border-purple-500 focus:ring-purple-500"
            />
          );
      }
    } else {
      return (
        <span className="text-sm text-gray-200">{formatValue(value)}</span>
      );
    }
  };

  return (
    <div className={`flex items-start gap-2 ${className}`}>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <label
            htmlFor={isFieldEditable && type !== "array" ? fieldId : undefined}
            className="text-xs font-medium text-gray-400 min-w-0 flex-shrink-0"
          >
            {name}
          </label>
          {isFieldEditable && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(name)}
              className="text-gray-400 hover:text-red-400 transition-colors"
              title="Delete field"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
        <div className="min-h-[24px]">{renderValue()}</div>
      </div>
    </div>
  );
}

interface PropertyGridProps {
  properties: Array<{
    key: string;
    value: any;
    type: "string" | "number" | "array" | "object";
  }>;
  editable?: boolean;
  onChange?: (key: string, newValue: any) => void;
  onDelete?: (key: string) => void;
  className?: string;
}

export function PropertyGrid({
  properties,
  editable = true,
  onChange,
  onDelete,
  className = "",
}: PropertyGridProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {properties.map(({ key, value, type }, index) => (
        <PropertyField
          key={key || `property-${index}`}
          name={key || `property-${index}`}
          value={value}
          type={type}
          editable={editable}
          onChange={onChange}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
