import type React from "react";
import type { StagedShardGroup } from "../../../types/shard";
import { Card } from "../../card/Card";
import { ShardItem } from "./ShardItem";

interface ShardGroupProps {
  group: StagedShardGroup;
  selectedShards: Set<string>;
  onShardSelection: (shardId: string, checked: boolean) => void;
}

export const ShardGroup: React.FC<ShardGroupProps> = ({
  group,
  selectedShards,
  onShardSelection,
}) => {
  return (
    <Card className="p-4">
      <div className="mb-3">
        <h4 className="font-medium text-gray-900">
          From: {group.sourceRef.meta.fileName}
        </h4>
        <p className="text-sm text-gray-500">
          Generated: {new Date(group.created_at).toLocaleString()}
        </p>
      </div>

      <div className="space-y-3">
        {group.shards.map((shard) => (
          <ShardItem
            key={shard.id}
            shard={{
              id: shard.id,
              text: shard.text,
              metadata: shard.metadata,
            }}
            isSelected={selectedShards.has(shard.id)}
            onSelectionChange={onShardSelection}
          />
        ))}
      </div>
    </Card>
  );
};
