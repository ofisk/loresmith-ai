import { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  FileText,
  Check,
  X,
} from "lucide-react";
import type { FlexibleShard } from "./ShardTypeDetector";
import {
  getShardTypeDisplayName,
  getConfidenceColorClass,
  getEditableProperties,
} from "./ShardTypeDetector";
import { PropertyGrid } from "./PropertyField";

interface FlexibleShardCardProps {
  shard: FlexibleShard;
  selected?: boolean;
  onSelect?: (shardId: string, selected: boolean) => void;
  onEdit?: (shardId: string, updates: Partial<FlexibleShard>) => void;
  onDelete?: (shardId: string) => void;
  onDeleteProperty?: (shardId: string, key: string) => void;
  className?: string;
}

export function FlexibleShardCard({
  shard,
  selected = false,
  onSelect,
  onEdit,
  onDelete,
  onDeleteProperty,
  className = "",
}: FlexibleShardCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const editableProperties = useMemo(
    () =>
      getEditableProperties(shard).filter(
        ({ key }) =>
          !["confidence", "type", "id", "source", "display_metadata"].includes(
            key
          )
      ),
    [shard]
  );
  const displayName = getShardTypeDisplayName(shard.type);
  const confidenceColor = getConfidenceColorClass(shard.confidence || 0);

  const handlePropertyChange = (key: string, newValue: any) => {
    if (onEdit) {
      onEdit(shard.id, { [key]: newValue });
    }
  };

  const handleDeleteProperty = (key: string) => {
    if (onDeleteProperty) {
      onDeleteProperty(shard.id, key);
    }
  };

  const handleTitleSave = () => {
    if (onEdit) {
      // Try to update the most likely title field
      const titleField = ["name", "title", "label"].find(
        (field) => shard[field] === getShardTitle()
      );
      if (titleField) {
        onEdit(shard.id, { [titleField]: titleValue });
      }
    }
  };

  const handleTitleCancel = () => {
    setTitleValue(getShardTitle());
  };

  const handleDescriptionSave = () => {
    if (onEdit) {
      // Try to update the most likely description field
      const descField = ["description", "text", "summary"].find(
        (field) => shard[field] === getShardDescription()
      );
      if (descField) {
        onEdit(shard.id, { [descField]: descriptionValue });
      }
    }
  };

  const handleDescriptionCancel = () => {
    setDescriptionValue(getShardDescription() || "");
  };

  const getShardTitle = () => {
    // Try to find a good title from common property names
    const titleFields = ["name", "title", "label", "id"];
    for (const field of titleFields) {
      if (shard[field] && typeof shard[field] === "string") {
        return shard[field];
      }
    }
    // Use contentId if available (for structured shards), otherwise fall back to ID suffix
    const displayId = (shard as any).contentId || shard.id.slice(-8);
    return `${displayName} #${displayId}`;
  };

  const getShardDescription = () => {
    // Try to find a good description from common property names
    const descFields = ["description", "text", "content", "summary"];
    for (const field of descFields) {
      if (shard[field] && typeof shard[field] === "string") {
        return shard[field];
      }
    }
    return null;
  };

  // State for editing title and description
  const [titleValue, setTitleValue] = useState(getShardTitle());
  const [descriptionValue, setDescriptionValue] = useState(
    getShardDescription() || ""
  );

  const getQuickProperties = () => {
    // Get 2-3 key properties to show in the collapsed view
    const quickFields = editableProperties
      .filter(
        ({ key }) =>
          ![
            "name",
            "title",
            "label",
            "description",
            "text",
            "content",
          ].includes(key)
      )
      .slice(0, 3);

    return quickFields;
  };

  return (
    <div
      className={`bg-gray-800 border border-gray-700 rounded-lg ${className}`}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect?.(shard.id, e.target.checked)}
              className="w-4 h-4 bg-gray-700 border-gray-600 text-purple-600 focus:ring-purple-500"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <input
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleTitleSave();
                    } else if (e.key === "Escape") {
                      handleTitleCancel();
                    }
                  }}
                  className="font-semibold text-lg text-white bg-transparent border-b border-gray-600 focus:border-purple-500 focus:outline-none flex-1"
                />
                <button
                  type="button"
                  onClick={handleTitleSave}
                  className="text-green-400 hover:text-green-300 transition-colors"
                  title="Save changes"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleTitleCancel}
                  className="text-red-400 hover:text-red-300 transition-colors"
                  title="Cancel changes"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <span className="capitalize">{displayName}</span>
                {shard.confidence && (
                  <>
                    <span>•</span>
                    <span className={`font-medium ${confidenceColor}`}>
                      {Math.round((shard.confidence || 0) * 100)}% confidence
                    </span>
                  </>
                )}
                <span>•</span>
                <span>{editableProperties.length} properties</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-400 hover:text-gray-200 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown size={20} />
              ) : (
                <ChevronRight size={20} />
              )}
            </button>
          </div>
        </div>

        {/* Quick Properties */}
        {!isExpanded && getQuickProperties().length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {getQuickProperties().map(({ key, value }) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700 text-gray-200 rounded text-xs"
              >
                <span className="font-medium">{key}:</span>
                <span className="truncate max-w-[100px]">
                  {Array.isArray(value)
                    ? value.join(", ")
                    : typeof value === "object" && value !== null
                      ? JSON.stringify(value)
                      : String(value)}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Description Preview */}
        {!isExpanded && getShardDescription() && (
          <p className="mt-2 text-sm text-gray-300 line-clamp-2">
            {getShardDescription()}
          </p>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Description */}
          {getShardDescription() && (
            <div>
              <label
                htmlFor={`shard-description-${shard.id}`}
                className="text-sm font-medium text-gray-300 flex items-center gap-2"
              >
                <FileText size={14} />
                Description
              </label>
              <div className="mt-1">
                <textarea
                  id={`shard-description-${shard.id}`}
                  value={descriptionValue}
                  onChange={(e) => setDescriptionValue(e.target.value)}
                  onBlur={handleDescriptionSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey) {
                      handleDescriptionSave();
                    } else if (e.key === "Escape") {
                      handleDescriptionCancel();
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-600 rounded text-sm bg-gray-700 text-white focus:border-purple-500 focus:ring-purple-500"
                  rows={4}
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleDescriptionSave}
                    className="text-green-400 hover:text-green-300 transition-colors"
                    title="Save changes"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={handleDescriptionCancel}
                    className="text-red-400 hover:text-red-300 transition-colors"
                    title="Cancel changes"
                  >
                    <X size={14} />
                  </button>
                  <span className="text-xs text-gray-400">
                    Ctrl+Enter to save, Esc to cancel
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Properties */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-white">Properties</h4>
            </div>

            <PropertyGrid
              properties={editableProperties}
              editable={true}
              onChange={handlePropertyChange}
              onDelete={handleDeleteProperty}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-700">
            <div className="text-xs text-gray-400">
              Shard ID: {(shard as any).contentId || shard.id.slice(-12)}
            </div>
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(shard.id)}
                className="flex items-center gap-1 px-3 py-1 text-red-400 hover:text-red-300 text-sm transition-colors"
              >
                <Trash2 size={14} />
                Delete Shard
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
