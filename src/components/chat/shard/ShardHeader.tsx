import type React from "react";

interface ShardHeaderProps {
  action: string;
  total: number;
  campaignName: string | null;
  resourceName?: string | null;
  shardType?: string;
  selectedCount: number;
  totalShards: number;
  onSelectAll: (checked: boolean) => void;
}

export const ShardHeader: React.FC<ShardHeaderProps> = ({
  action,
  total,
  campaignName,
  resourceName,
  shardType,
  selectedCount,
  totalShards,
  onSelectAll,
}) => {
  return (
    <div className="flex justify-between items-center">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">
          Shard Management -{" "}
          {action.replace("show_", "").replace("_", " ").toUpperCase()}
        </h3>
        <p className="text-sm text-gray-600">
          Found {total} shards for campaign {campaignName || "unknown campaign"}
          {` • Resource: ${resourceName || "unknown resource"}`}
          {shardType && ` • Type: ${shardType}`}
        </p>
      </div>

      <div className="flex items-center space-x-2">
        <label className="flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={selectedCount === totalShards}
            onChange={(e) => onSelectAll(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span>Select All</span>
        </label>
      </div>
    </div>
  );
};
