import type React from "react";

interface ShardHeaderProps {
  action: string;
  total: number;
  campaignId: string;
  resourceId?: string;
  shardType?: string;
  selectedCount: number;
  totalShards: number;
  onSelectAll: (checked: boolean) => void;
}

export const ShardHeader: React.FC<ShardHeaderProps> = ({
  action,
  total,
  campaignId,
  resourceId,
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
          Found {total} shards for campaign {campaignId}
          {resourceId && ` • Resource: ${resourceId}`}
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
