import type React from "react";
import type { StagedShardGroup } from "../../../types/shard";
import { Card } from "../../card/Card";
import { ShardItem } from "./ShardItem";

interface ShardGroupProps {
  group: StagedShardGroup;
  selectedShards: Set<string>;
  onShardSelection: (shardId: string, checked: boolean) => void;
  onApproveOne?: (shardId: string) => Promise<void> | void;
  onRejectOne?: (shardId: string, reason: string) => Promise<void> | void;
  processingShard?: {
    id: string;
    action: "approving" | "rejecting" | null;
  } | null;
}

export const ShardGroup: React.FC<ShardGroupProps> = ({
  group,
  selectedShards,
  onShardSelection,
  onApproveOne,
  onRejectOne,
  processingShard,
}) => {
  return (
    <Card className="p-4 bg-neutral-800 dark:bg-neutral-800 border-neutral-600 dark:border-neutral-700">
      <div className="mb-3">
        <h4 className="font-medium text-white dark:text-white">
          From: {group.sourceRef.meta.fileName}
        </h4>
        <p className="text-sm text-neutral-400 dark:text-neutral-400">
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
            onApprove={onApproveOne ? () => onApproveOne(shard.id) : undefined}
            onReject={
              onRejectOne
                ? (reason) => onRejectOne(shard.id, reason)
                : undefined
            }
            isApproving={
              processingShard?.id === shard.id &&
              processingShard.action === "approving"
            }
            isRejecting={
              processingShard?.id === shard.id &&
              processingShard.action === "rejecting"
            }
          />
        ))}
      </div>
    </Card>
  );
};
