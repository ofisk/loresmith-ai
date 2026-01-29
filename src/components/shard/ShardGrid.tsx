import { useState, useMemo } from "react";
import {
  CheckSquare,
  Filter,
  Search,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import type { Shard } from "./shard-type-detector";
import {
  isKnownStructure,
  getShardTypeDisplayName,
} from "./shard-type-detector";
import { StructuredShardCard } from "./StructuredShardCard";
import { FlexibleShardCard } from "./FlexibleShardCard";
import { isStubContentSufficient } from "@/lib/entity-required-fields";

interface ShardGridProps {
  shards: Shard[];
  campaignId: string;
  campaignName?: string;
  resourceName?: string;
  onShardEdit?: (shardId: string, updates: Partial<Shard>) => void;
  onShardDelete?: (shardId: string) => void;
  onBulkAction?: (action: string, shardIds: string[]) => void;
  onRefresh?: () => void;
  className?: string;
}

interface FilterState {
  search: string;
  type: string;
  confidence: string;
  showOnlySelected: boolean;
}

export function ShardGrid({
  shards,
  campaignId,
  campaignName,
  resourceName,
  onShardEdit,
  onShardDelete,
  onBulkAction,
  onRefresh,
  className = "",
}: ShardGridProps) {
  const [selectedShards, setSelectedShards] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    type: "",
    confidence: "",
    showOnlySelected: false,
  });

  // Get unique shard types for filter dropdown
  const shardTypes = useMemo(() => {
    const types = new Set(shards.map((shard) => shard.type));
    return Array.from(types).sort();
  }, [shards]);

  // Filter and search shards
  const filteredShards = useMemo(() => {
    return shards.filter((shard) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const searchableText = [
          shard.id,
          shard.name || "",
          shard.text || "",
          ...Object.entries(shard)
            .filter(([key]) => !["id", "metadata"].includes(key))
            .map(([key, value]) => `${key}: ${value}`),
        ]
          .join(" ")
          .toLowerCase();

        if (!searchableText.includes(searchLower)) {
          return false;
        }
      }

      // Type filter
      if (filters.type && shard.type !== filters.type) {
        return false;
      }

      // Confidence filter
      if (filters.confidence && shard.confidence) {
        const confidence = shard.confidence;
        switch (filters.confidence) {
          case "high":
            if (confidence < 90) return false;
            break;
          case "medium":
            if (confidence < 75 || confidence >= 90) return false;
            break;
          case "low":
            if (confidence >= 75) return false;
            break;
        }
      }

      // Selected filter
      if (filters.showOnlySelected && !selectedShards.has(shard.id)) {
        return false;
      }

      return true;
    });
  }, [shards, filters, selectedShards]);

  const handleSelectShard = (shardId: string, selected: boolean) => {
    const newSelected = new Set(selectedShards);
    if (selected) {
      newSelected.add(shardId);
    } else {
      newSelected.delete(shardId);
    }
    setSelectedShards(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedShards.size === filteredShards.length) {
      setSelectedShards(new Set());
    } else {
      setSelectedShards(new Set(filteredShards.map((shard) => shard.id)));
    }
  };

  const handleBulkAction = (action: string) => {
    if (selectedShards.size === 0) return;

    if (onBulkAction) {
      onBulkAction(action, Array.from(selectedShards));
    }

    // Clear selection after bulk action
    setSelectedShards(new Set());
  };

  const groupedShards = useMemo(() => {
    const groups: { [key: string]: Shard[] } = {};

    filteredShards.forEach((shard) => {
      const type = shard.type;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(shard);
    });

    return groups;
  }, [filteredShards]);

  const allSelected =
    filteredShards.length > 0 && selectedShards.size === filteredShards.length;
  const someSelected =
    selectedShards.size > 0 && selectedShards.size < filteredShards.length;

  const canApproveShard = (s: Shard) => {
    const isStub =
      (s.metadata as Record<string, unknown> | undefined)?.isStub === true;
    if (!isStub) return true;
    return isStubContentSufficient(
      s as unknown as Record<string, unknown>,
      s.type
    );
  };
  const selectedShardList = filteredShards.filter((s) =>
    selectedShards.has(s.id)
  );
  const approveDisabled =
    selectedShardList.length === 0 ||
    selectedShardList.some((s) => !canApproveShard(s));

  return (
    <div className={`space-y-4 pl-4 ${className}`}>
      {/* Header */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Shard Management - STAGED
            </h2>
            <p className="text-sm text-gray-300 mt-1">
              Found {filteredShards.length} shards for campaign{" "}
              {campaignName || campaignId}
              {resourceName && ` • Resource: ${resourceName}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="p-2 text-gray-400 hover:text-gray-200 transition-colors"
              title="Refresh shards"
            >
              <RefreshCw size={20} />
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-600 rounded text-sm hover:bg-gray-700 text-gray-300 transition-colors"
            >
              <Filter size={16} />
              Filters
              {showFilters ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="border-t border-gray-700 pt-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  placeholder="Search shards..."
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, search: e.target.value }))
                  }
                  className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded text-sm bg-gray-700 text-white placeholder-gray-400 focus:border-purple-500 focus:ring-purple-500"
                />
              </div>

              <select
                value={filters.type}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, type: e.target.value }))
                }
                className="px-3 py-2 border border-gray-600 rounded text-sm bg-gray-700 text-white focus:border-purple-500 focus:ring-purple-500"
              >
                <option value="">All types</option>
                {shardTypes.map((type) => (
                  <option key={type} value={type}>
                    {getShardTypeDisplayName(type)}
                  </option>
                ))}
              </select>

              <select
                value={filters.confidence}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    confidence: e.target.value,
                  }))
                }
                className="px-3 py-2 border border-gray-600 rounded text-sm bg-gray-700 text-white focus:border-purple-500 focus:ring-purple-500"
              >
                <option value="">All confidence</option>
                <option value="high">High (90%+)</option>
                <option value="medium">Medium (75-89%)</option>
                <option value="low">Low (&lt;75%)</option>
              </select>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={filters.showOnlySelected}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      showOnlySelected: e.target.checked,
                    }))
                  }
                  className="w-4 h-4"
                />
                Show only selected
              </label>
            </div>
          </div>
        )}

        {/* Bulk Actions */}
        {selectedShards.size > 0 && (
          <div className="border-t pt-4 mt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  {allSelected ? "Deselect All" : "Select All"}
                </button>
                <span className="text-sm text-gray-600">
                  {selectedShards.size} shard
                  {selectedShards.size !== 1 ? "s" : ""} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleBulkAction("approve")}
                  disabled={approveDisabled}
                  title={
                    approveDisabled && selectedShardList.length > 0
                      ? "Fill required fields before approving"
                      : undefined
                  }
                  className="flex items-center gap-2 font-semibold text-sm transition-colors text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-purple-600 dark:disabled:hover:text-purple-400"
                >
                  <CheckSquare size={16} />
                  Approve selected
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkAction("reject")}
                  className="flex items-center gap-2 font-semibold text-sm transition-colors text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                >
                  <Trash2 size={16} />
                  Reject selected
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkAction("edit")}
                  className="flex items-center gap-2 font-semibold text-sm transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <Edit3 size={16} />
                  Bulk edit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Select All Checkbox */}
        {filteredShards.length > 0 && (
          <div className="border-t border-gray-700 pt-4 mt-4">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(input) => {
                  if (input) input.indeterminate = someSelected;
                }}
                onChange={handleSelectAll}
                className="w-4 h-4 bg-gray-700 border-gray-600 text-purple-600 focus:ring-purple-500"
              />
              Select All
            </label>
          </div>
        )}
      </div>

      {/* Shard Groups */}
      {Object.keys(groupedShards).length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
          <p className="text-gray-500">
            No shards found matching your filters.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedShards).map(([type, typeShards]) => (
            <div key={type} className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium text-white">
                  {getShardTypeDisplayName(type)}
                </h3>
                <span className="text-sm text-gray-400">
                  ({typeShards.length} shard{typeShards.length !== 1 ? "s" : ""}
                  )
                </span>
              </div>

              <div className="space-y-3">
                {typeShards.map((shard) => (
                  <div key={shard.id}>
                    {isKnownStructure(shard) ? (
                      <StructuredShardCard
                        shard={shard}
                        selected={selectedShards.has(shard.id)}
                        onSelect={handleSelectShard}
                        onEdit={onShardEdit}
                        onDelete={onShardDelete}
                        campaignId={campaignId}
                      />
                    ) : (
                      <FlexibleShardCard
                        shard={shard}
                        selected={selectedShards.has(shard.id)}
                        onSelect={handleSelectShard}
                        onEdit={onShardEdit}
                        onDelete={onShardDelete}
                        campaignId={campaignId}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
