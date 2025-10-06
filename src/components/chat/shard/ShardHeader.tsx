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
        <h3 className="text-lg font-semibold text-white dark:text-white">
          Shard Management -{" "}
          {action.replace("show_", "").replace("_", " ").toUpperCase()}
        </h3>
        <p className="text-sm text-neutral-300 dark:text-neutral-300">
          Found {total} shards for campaign {campaignName || "unknown campaign"}
          {` • Resource: ${resourceName || "unknown resource"}`}
          {shardType && ` • Type: ${shardType}`}
        </p>
      </div>

      <div className="flex items-center space-x-2">
        <label className="flex items-center space-x-2 text-sm text-neutral-200 dark:text-neutral-200">
          <input
            type="checkbox"
            checked={selectedCount === totalShards}
            onChange={(e) => onSelectAll(e.target.checked)}
            className="rounded border-neutral-600 dark:border-neutral-500 bg-neutral-700 dark:bg-neutral-700 text-white"
          />
          <span>Select All</span>
        </label>
      </div>
    </div>
  );
};
