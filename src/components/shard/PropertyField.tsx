import type React from "react";
import { useState, useRef, useEffect } from "react";
import { Check, X, Plus, Trash2 } from "lucide-react";

interface PropertyFieldProps {
  name: string;
  value: any;
  type: "string" | "number" | "array" | "object";
  editable?: boolean;
  onChange?: (key: string, newValue: any) => void;
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
  const [editValue, setEditValue] = useState(value);
  const [newArrayItem, setNewArrayItem] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isFieldEditable) {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      } else if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
      }
    }
  }, [isFieldEditable]);

  const handleSave = () => {
    if (onChange) {
      onChange(name, editValue);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
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
      const updatedArray = [...editValue, newArrayItem.trim()];
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
    return String(val);
  };

  const renderValue = () => {
    if (isFieldEditable) {
      switch (type) {
        case "number":
          return (
            <input
              ref={inputRef}
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(Number(e.target.value))}
              onKeyDown={handleKeyDown}
              className="w-full px-2 py-1 border border-gray-600 rounded text-sm bg-gray-700 text-white focus:border-purple-500 focus:ring-purple-500"
            />
          );

        case "array":
          return (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {Array.isArray(editValue) &&
                  editValue.map((item, index) => (
                    <span
                      key={`${item}-${index}`}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-purple-700 text-purple-200 rounded text-xs"
                    >
                      {item}
                      <button
                        type="button"
                        onClick={() => removeArrayItem(index)}
                        className="text-purple-300 hover:text-purple-100 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newArrayItem}
                  onChange={(e) => setNewArrayItem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addArrayItem()}
                  placeholder="Add new item"
                  className="flex-1 px-2 py-1 border border-gray-600 rounded text-sm bg-gray-700 text-white placeholder-gray-400 focus:border-purple-500 focus:ring-purple-500"
                />
                <button
                  type="button"
                  onClick={addArrayItem}
                  className="px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
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
              onKeyDown={handleKeyDown}
              className="w-full px-2 py-1 border border-gray-600 rounded text-sm font-mono bg-gray-700 text-white focus:border-purple-500 focus:ring-purple-500"
              rows={4}
            />
          );

        default: // string
          return (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
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
          <label className="text-xs font-medium text-gray-400 min-w-0 flex-shrink-0">
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

      {isFieldEditable && (
        <div className="flex gap-1 mt-1">
          <button
            type="button"
            onClick={handleSave}
            className="text-green-400 hover:text-green-300 transition-colors"
            title="Save changes"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="text-red-400 hover:text-red-300 transition-colors"
            title="Cancel changes"
          >
            <X size={14} />
          </button>
        </div>
      )}
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
      {properties.map(({ key, value, type }) => (
        <PropertyField
          key={key}
          name={key}
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
