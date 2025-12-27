import { useState, useMemo, useEffect } from "react";
import { Edit2, ChevronDown, ChevronRight, Star } from "lucide-react";
import type { StructuredShard } from "./shard-type-detector";
import {
  getConfidenceColorClass,
  getShardTypeDisplayName,
  getEditableProperties,
} from "./shard-type-detector";
import { PropertyField } from "./PropertyField";
import {
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";
import { ImportanceCalculationError } from "@/lib/errors";

type ImportanceLevel = "high" | "medium" | "low" | null;

interface StructuredShardCardProps {
  shard: StructuredShard;
  selected?: boolean;
  onSelect?: (shardId: string, selected: boolean) => void;
  onEdit?: (shardId: string, updates: Partial<StructuredShard>) => void;
  onDelete?: (shardId: string) => void;
  className?: string;
  campaignId?: string;
}

export function StructuredShardCard({
  shard,
  selected = false,
  onSelect,
  onEdit,
  onDelete: _onDelete,
  className = "",
  campaignId,
}: StructuredShardCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [importanceLoading, setImportanceLoading] = useState(false);

  // Get importance from metadata
  const importanceScore = (shard.metadata as any)?.importanceScore as
    | number
    | undefined;
  const importanceOverride = (shard.metadata as any)?.importanceOverride as
    | ImportanceLevel
    | undefined;

  // Determine current importance level from score or override
  const getImportanceLevel = useMemo((): ImportanceLevel => {
    if (importanceOverride !== undefined) {
      return importanceOverride;
    }
    if (importanceScore !== undefined) {
      if (importanceScore >= 80) return "high";
      if (importanceScore >= 60) return "medium";
      return "low";
    }
    return null;
  }, [importanceScore, importanceOverride]);

  const [currentImportance, setCurrentImportance] =
    useState<ImportanceLevel>(getImportanceLevel);

  // Update local state when shard metadata changes
  useEffect(() => {
    setCurrentImportance(getImportanceLevel);
  }, [getImportanceLevel]);

  const handleImportanceChange = async (newLevel: ImportanceLevel) => {
    if (!campaignId) {
      console.warn(
        "[StructuredShardCard] Cannot update importance: campaignId not provided"
      );
      return;
    }

    setImportanceLoading(true);
    try {
      const jwt = getStoredJwt();
      if (!jwt) {
        throw new Error("No authentication token available");
      }

      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.IMPORTANCE(
            campaignId,
            shard.id
          )
        ),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({ importanceLevel: newLevel }),
        }
      );

      if (jwtExpired) {
        throw new Error("Session expired. Please refresh the page.");
      }

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new ImportanceCalculationError(
          errorData.error || `Failed to update importance`,
          response.status
        );
      }

      const result = (await response.json()) as {
        entity?: {
          metadata?: Record<string, unknown>;
        };
      };
      if (result.entity) {
        // Update local state
        setCurrentImportance(newLevel);
        // Notify parent component if onEdit is provided
        if (onEdit) {
          const currentMetadata =
            typeof shard.metadata === "object" && shard.metadata !== null
              ? shard.metadata
              : {};
          onEdit(shard.id, {
            metadata: {
              ...currentMetadata,
              importanceOverride: newLevel,
              importanceScore: (result.entity.metadata as any)?.importanceScore,
            },
          } as Partial<StructuredShard>);
        }
      }
    } catch (error) {
      console.error(
        "[StructuredShardCard] Failed to update importance:",
        error
      );
      alert(
        error instanceof Error ? error.message : "Failed to update importance"
      );
      // Revert to previous value on error
      setCurrentImportance(getImportanceLevel);
    } finally {
      setImportanceLoading(false);
    }
  };

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

  // Helper to check if a string looks like an ID (UUID-like or contains underscores with long hex strings)
  const looksLikeId = (str: string): boolean => {
    if (!str) return false;
    // Check for UUID pattern or campaign-scoped ID pattern (campaignId_entityId)
    return (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
        str
      ) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i.test(
        str
      ) ||
      (str.includes("_") && str.length > 30)
    );
  };

  // Extract name from content if current name looks like an ID
  const extractNameFromContent = (): string | null => {
    const currentName = (shard.name as string | undefined) || "";
    if (!looksLikeId(currentName)) {
      return null; // Name is already human-readable
    }

    // Try to parse shard.text as JSON to get the content
    if (shard.text && typeof shard.text === "string") {
      try {
        const content = JSON.parse(shard.text);
        if (content && typeof content === "object") {
          // Check type-specific fields based on entity type
          const entityType = shard.type || (shard.metadata as any)?.entityType;

          if (entityType === "travel" && content.route) {
            return typeof content.route === "string" ? content.route : null;
          }
          if (entityType === "puzzles" && content.prompt) {
            return typeof content.prompt === "string" ? content.prompt : null;
          }
          if (content.title) {
            return typeof content.title === "string" ? content.title : null;
          }
          if (content.name) {
            return typeof content.name === "string" ? content.name : null;
          }
        }
      } catch {
        // Not JSON, ignore
      }
    }
    return null;
  };

  const extractedName = extractNameFromContent();

  const displayName: string =
    (displayMetadata.display_name as string | undefined) ||
    extractedName ||
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
              {subtitleInfo.map((info: string) => (
                <span
                  key={`${typeDisplayName}-${info}`}
                  className="flex items-center gap-2"
                >
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
              <label
                htmlFor={`structured-description-${shard.id}`}
                className="text-sm font-medium text-gray-300"
              >
                Description:
              </label>
              {isEditing && onEdit ? (
                <textarea
                  id={`structured-description-${shard.id}`}
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

          {/* Importance */}
          {campaignId && (
            <div>
              <label
                htmlFor={`shard-importance-${shard.id}`}
                className="text-sm font-medium text-gray-300 flex items-center gap-2 mb-2"
              >
                <Star size={14} />
                Importance
                {importanceScore !== undefined && (
                  <span className="text-xs text-gray-400">
                    (Score: {Math.round(importanceScore)})
                  </span>
                )}
              </label>
              <select
                id={`shard-importance-${shard.id}`}
                value={currentImportance || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  handleImportanceChange(
                    value === "" ? null : (value as ImportanceLevel)
                  );
                }}
                disabled={importanceLoading}
                className="w-full px-3 py-2 border border-gray-600 rounded text-sm bg-gray-700 text-white focus:border-purple-500 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Auto (calculated)</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              {importanceLoading && (
                <p className="text-xs text-gray-400 mt-1">Updating...</p>
              )}
            </div>
          )}

          {/* Editable Fields */}
          {isEditing && onEdit && (
            <div className="border-t border-gray-700 pt-3 space-y-3">
              <h4 className="font-medium text-white">Edit properties</h4>
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
