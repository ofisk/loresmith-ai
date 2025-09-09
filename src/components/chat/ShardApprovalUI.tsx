import React, { useState } from "react";
import type { ShardCandidate } from "../../types/shard";
import {
  ShardItem,
  ShardApprovalActionBar,
  ShardApprovalHeader,
} from "./shard";

interface ShardApprovalUIProps {
  campaignId: string;
  shards: ShardCandidate[];
  shardIds: string[];
  reason?: string;
  total: number;
}

export const ShardApprovalUI: React.FC<ShardApprovalUIProps> = ({
  campaignId,
  shards,
  shardIds,
  reason,
  total,
}) => {
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const handleApproveAll = async () => {
    setProcessing("approving");
    try {
      window.dispatchEvent(
        new CustomEvent("approve-shards", {
          detail: {
            campaignId,
            shardIds,
            source: "chat-ui",
            reason,
          },
        })
      );
    } catch (error) {
      console.error("Error approving shards:", error);
    } finally {
      setProcessing(null);
    }
  };

  const handleRejectAll = async () => {
    if (!rejectionReason.trim()) return;

    setProcessing("rejecting");
    try {
      // This would call the rejectShards tool through the AI agent
      window.dispatchEvent(
        new CustomEvent("reject-shards", {
          detail: {
            campaignId,
            shardIds,
            reason: rejectionReason,
            source: "chat-ui",
          },
        })
      );
    } catch (error) {
      console.error("Error rejecting shards:", error);
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-4 border border-gray-200 rounded-lg p-4 bg-white">
      <ShardApprovalHeader
        campaignId={campaignId}
        total={total}
        reason={reason}
      />

      <ShardApprovalActionBar
        total={total}
        processing={processing}
        rejectionReason={rejectionReason}
        onRejectionReasonChange={setRejectionReason}
        onApprove={handleApproveAll}
        onReject={handleRejectAll}
      />

      <div className="space-y-3">
        {shards.map((shard) => (
          <ShardItem
            key={shard.id}
            shard={{
              id: shard.id,
              text: shard.text,
              metadata: shard.metadata,
            }}
            isSelected={false}
            onSelectionChange={() => {}} // No selection needed in approval UI
          />
        ))}
      </div>
    </div>
  );
};
