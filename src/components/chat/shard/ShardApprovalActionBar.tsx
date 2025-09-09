import React from "react";
import { Button } from "../../button/Button";

interface ShardApprovalActionBarProps {
  total: number;
  processing: string | null;
  rejectionReason: string;
  onRejectionReasonChange: (reason: string) => void;
  onApprove: () => void;
  onReject: () => void;
}

export const ShardApprovalActionBar: React.FC<ShardApprovalActionBarProps> = ({
  total,
  processing,
  rejectionReason,
  onRejectionReasonChange,
  onApprove,
  onReject,
}) => {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-blue-800 font-medium">
          {total} shard{total !== 1 ? "s" : ""} ready for processing
        </p>
        <div className="flex space-x-2">
          <Button
            onClick={onApprove}
            disabled={processing === "approving"}
            size="sm"
            className="bg-green-600 hover:bg-green-700"
          >
            {processing === "approving"
              ? "Approving..."
              : `Approve All ${total}`}
          </Button>
          <Button
            onClick={onReject}
            disabled={processing === "rejecting" || !rejectionReason.trim()}
            variant="secondary"
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {processing === "rejecting"
              ? "Rejecting..."
              : `Reject All ${total}`}
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <input
          type="text"
          placeholder="Reason for rejection (required for rejection)"
          value={rejectionReason}
          onChange={(e) => onRejectionReasonChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>
    </div>
  );
};
