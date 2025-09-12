import type React from "react";
import { useState } from "react";
import type { StagedShardGroup } from "../../types/shard";
import { ShardHeader, ShardActionBar, ShardGroup, EmptyState } from "./shard";

interface ShardManagementUIProps {
  campaignId: string;
  shards: StagedShardGroup[];
  total: number;
  status: string;
  action: string;
  resourceId?: string;
  shardType?: string;
}

export const ShardManagementUI: React.FC<ShardManagementUIProps> = ({
  campaignId,
  shards,
  total,
  action,
  resourceId,
  shardType,
}) => {
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedShards, setSelectedShards] = useState<Set<string>>(new Set());
  const [rejectionReason, setRejectionReason] = useState("");

  const handleShardSelection = (shardId: string, checked: boolean) => {
    const newSelected = new Set(selectedShards);
    if (checked) {
      newSelected.add(shardId);
    } else {
      newSelected.delete(shardId);
    }
    setSelectedShards(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allShardIds = shards.flatMap((group) =>
        group.shards.map((shard) => shard.id)
      );
      setSelectedShards(new Set(allShardIds));
    } else {
      setSelectedShards(new Set());
    }
  };

  const handleApproveSelected = async () => {
    if (selectedShards.size === 0) return;

    setProcessing("approving");
    try {
      window.dispatchEvent(
        new CustomEvent("approve-shards", {
          detail: {
            campaignId,
            shardIds: Array.from(selectedShards),
            source: "chat-ui",
          },
        })
      );

      setSelectedShards(new Set());
    } catch (error) {
      console.error("Error approving shards:", error);
    } finally {
      setProcessing(null);
    }
  };

  const handleRejectSelected = async () => {
    if (selectedShards.size === 0 || !rejectionReason.trim()) return;

    setProcessing("rejecting");
    try {
      // This would call the rejectShards tool through the AI agent
      window.dispatchEvent(
        new CustomEvent("reject-shards", {
          detail: {
            campaignId,
            shardIds: Array.from(selectedShards),
            reason: rejectionReason,
            source: "chat-ui",
          },
        })
      );

      setSelectedShards(new Set());
      setRejectionReason("");
    } catch (error) {
      console.error("Error rejecting shards:", error);
    } finally {
      setProcessing(null);
    }
  };

  if (shards.length === 0) {
    return <EmptyState action={action} />;
  }

  return (
    <div className="space-y-4 border border-gray-200 rounded-lg p-4 bg-white">
      <ShardHeader
        action={action}
        total={total}
        campaignId={campaignId}
        resourceId={resourceId}
        shardType={shardType}
        selectedCount={selectedShards.size}
        totalShards={shards.flatMap((g) => g.shards).length}
        onSelectAll={handleSelectAll}
      />

      <ShardActionBar
        selectedCount={selectedShards.size}
        processing={processing}
        action={action}
        rejectionReason={rejectionReason}
        onRejectionReasonChange={setRejectionReason}
        onApprove={handleApproveSelected}
        onReject={handleRejectSelected}
      />

      <div className="space-y-4">
        {shards.map((group) => (
          <ShardGroup
            key={group.key}
            group={group}
            selectedShards={selectedShards}
            onShardSelection={handleShardSelection}
          />
        ))}
      </div>
    </div>
  );
};
