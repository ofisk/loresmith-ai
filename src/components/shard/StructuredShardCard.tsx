import { useState } from "react";
import { Edit2, ChevronDown, ChevronRight } from "lucide-react";
import type { StructuredShard } from "./ShardTypeDetector";
import {
  getConfidenceColorClass,
  getShardTypeDisplayName,
  getEditableProperties,
} from "./ShardTypeDetector";
import { PropertyField } from "./PropertyField";

interface StructuredShardCardProps {
  shard: StructuredShard;
  selected?: boolean;
  onSelect?: (shardId: string, selected: boolean) => void;
  onEdit?: (shardId: string, updates: Partial<StructuredShard>) => void;
  onDelete?: (shardId: string) => void;
  className?: string;
}

export function StructuredShardCard({
  shard,
  selected = false,
  onSelect,
  onEdit,
  onDelete: _onDelete,
  className = "",
}: StructuredShardCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const handlePropertyChange = (key: string, newValue: any) => {
    if (onEdit) {
      onEdit(shard.id, { [key]: newValue });
    }
  };

  // Use LLM-provided display metadata if available, otherwise fallback to sensible defaults
  const displayMetadata = (shard.display_metadata || {}) as {
    display_name?: string;
    subtitle?: string[];
    quick_info?: string[];
    primary_text?: string;
  };

  const displayName: string =
    (displayMetadata.display_name as string | undefined) ||
    (shard.name as string | undefined) ||
    (shard.title as string | undefined) ||
    (shard.id as string | undefined) ||
    "Unnamed";
  const subtitleInfo = displayMetadata.subtitle || [];

  // Get quick info properties - use LLM suggestions if available
  const getQuickInfoProperties = (): Array<{
    key: string;
    value: any;
    type: "string" | "number" | "array" | "object";
  }> => {
    if (displayMetadata.quick_info && displayMetadata.quick_info.length > 0) {
      // Use LLM-specified properties
      return displayMetadata.quick_info
        .map((key: string) => {
          const value = shard[key];
          if (value === undefined) return null;
          return {
            key,
            value,
            type: Array.isArray(value)
              ? ("array" as const)
              : typeof value === "number"
                ? ("number" as const)
                : ("string" as const),
          };
        })
        .filter(Boolean) as Array<{
        key: string;
        value: any;
        type: "string" | "number" | "array" | "object";
      }>;
    }

    // Fallback: auto-detect important properties
    const properties = getEditableProperties(shard);
    const excludeKeys = [
      "id",
      "type",
      "confidence",
      "display_metadata",
      "source",
    ];
    const longTextFields = ["text", "summary", "description", "one_line"]; // Exclude long text from quick view

    return properties
      .filter(
        ({ key }) => !excludeKeys.includes(key) && !longTextFields.includes(key)
      )
      .filter(({ type }) => type !== "object")
      .slice(0, 4);
  };

  // Get detailed properties (everything except metadata)
  const getDetailedProperties = () => {
    const properties = getEditableProperties(shard);
    const excludeKeys = [
      "id",
      "type",
      "confidence",
      "display_metadata",
      "source",
    ];

    return properties.filter(({ key }) => !excludeKeys.includes(key));
  };

  // Get main text content - use LLM hint if available
  const getMainText = (): string => {
    if (
      displayMetadata.primary_text &&
      shard[displayMetadata.primary_text as keyof typeof shard]
    ) {
      const value = shard[displayMetadata.primary_text as keyof typeof shard];
      return typeof value === "string" ? value : String(value || "");
    }
    return (
      (shard.text as string | undefined) ||
      (shard.summary as string | undefined) ||
      (shard.description as string | undefined) ||
      ""
    );
  };

  const confidenceColor = getConfidenceColorClass(shard.confidence || 0);
  const quickInfo = getQuickInfoProperties();
  const detailedProperties = getDetailedProperties();
  const typeDisplayName = getShardTypeDisplayName(shard.type);
  const mainText = getMainText();

  return (
    <div
      className={`bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {onSelect && (
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect(shard.id, e.target.checked)}
              className="w-4 h-4 flex-shrink-0 bg-gray-700 border-gray-600 text-purple-600 focus:ring-purple-500"
            />
          )}
          <div className="min-w-0 flex-1">
            {isEditing && onEdit ? (
              <input
                value={displayName}
                onChange={(e) => {
                  const nameField = displayMetadata.display_name || "name";
                  onEdit(shard.id, { [nameField]: e.target.value });
                }}
                className="font-semibold text-lg text-white bg-transparent border-b border-gray-600 focus:border-purple-500 focus:outline-none w-full"
              />
            ) : (
              <h3 className="font-semibold text-lg text-white truncate">
                {displayName}
              </h3>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-300 flex-wrap">
              <span className="capitalize">{typeDisplayName}</span>
              {subtitleInfo.map((info: string, i: number) => (
                <span key={`${info}-${i}`} className="flex items-center gap-2">
                  <span>•</span>
                  <span>{info}</span>
                </span>
              ))}
              {shard.confidence && (
                <>
                  <span>•</span>
                  <span className={`font-medium ${confidenceColor}`}>
                    {Math.round((shard.confidence || 0) * 100)}% confidence
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-gray-200 transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <ChevronDown size={20} />
            ) : (
              <ChevronRight size={20} />
            )}
          </button>
          {onEdit && (
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className="text-gray-400 hover:text-gray-200 transition-colors"
              title={isEditing ? "Stop editing" : "Edit"}
            >
              <Edit2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Quick Info - Show a few key properties when collapsed */}
      {quickInfo.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {quickInfo.map(({ key, value }) => {
            const displayValue = Array.isArray(value)
              ? value.join(", ")
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value);

            return (
              <div key={key} className="flex flex-col">
                <span className="text-gray-400 text-xs font-medium capitalize">
                  {key.replace(/_/g, " ")}:
                </span>
                <span
                  className="font-medium text-gray-200 truncate"
                  title={displayValue}
                >
                  {displayValue || "N/A"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-gray-700 pt-3 space-y-3">
          {/* Main text content */}
          {mainText && (
            <div>
              <label className="text-sm font-medium text-gray-300">
                Description:
              </label>
              {isEditing && onEdit ? (
                <textarea
                  value={mainText}
                  onChange={(e) => {
                    const fieldName = displayMetadata.primary_text || "text";
                    onEdit(shard.id, {
                      [fieldName]: e.target.value,
                    } as Partial<StructuredShard>);
                  }}
                  className="w-full mt-1 px-3 py-2 border border-gray-600 rounded text-sm bg-gray-700 text-white focus:border-purple-500 focus:ring-purple-500"
                  rows={4}
                />
              ) : (
                <p className="text-sm text-gray-200 mt-1 whitespace-pre-wrap">
                  {mainText}
                </p>
              )}
            </div>
          )}

          {/* Editable Fields */}
          {isEditing && onEdit && (
            <div className="border-t border-gray-700 pt-3 space-y-3">
              <h4 className="font-medium text-white">Edit Properties</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {detailedProperties.map(({ key, value, type }) => (
                  <PropertyField
                    key={key}
                    name={key}
                    value={value}
                    type={type}
                    onChange={handlePropertyChange}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
