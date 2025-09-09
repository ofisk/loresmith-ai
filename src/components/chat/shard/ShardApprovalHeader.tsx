import React from "react";

interface ShardApprovalHeaderProps {
  campaignId: string;
  total: number;
  reason?: string;
}

export const ShardApprovalHeader: React.FC<ShardApprovalHeaderProps> = ({
  campaignId,
  total,
  reason,
}) => {
  return (
    <div className="text-center">
      <h3 className="text-lg font-semibold text-gray-900">
        Shard Approval Interface
      </h3>
      <p className="text-sm text-gray-600">
        Ready to process {total} shards for campaign {campaignId}
      </p>
      {reason && (
        <p className="text-sm text-blue-600 mt-1">Context: {reason}</p>
      )}
    </div>
  );
};
