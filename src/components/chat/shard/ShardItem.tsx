import type React from "react";

interface ShardItemProps {
  shard: {
    id: string;
    text: string;
    metadata: {
      entityType: string;
      confidence?: number;
      query?: string;
    };
  };
  isSelected: boolean;
  onSelectionChange: (shardId: string, checked: boolean) => void;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
  isApproving?: boolean;
  isRejecting?: boolean;
}

export const ShardItem: React.FC<ShardItemProps> = ({
  shard,
  isSelected,
  onSelectionChange,
  onApprove,
  onReject,
  isApproving = false,
  isRejecting = false,
}) => {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-start space-x-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelectionChange(shard.id, e.target.checked)}
          className="mt-1 rounded border-gray-300"
        />

        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {shard.metadata.entityType}
            </span>
            {typeof shard.metadata.confidence === "number" &&
              !Number.isNaN(shard.metadata.confidence) && (
                <span className="text-sm text-gray-500">
                  Confidence: {Math.round(shard.metadata.confidence * 100)}%
                </span>
              )}
          </div>

          <p className="text-gray-700 whitespace-pre-wrap text-sm">
            {shard.text}
          </p>

          {shard.metadata.query && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                View Query
              </summary>
              <p className="mt-1 p-2 bg-gray-50 rounded text-xs">
                {shard.metadata.query}
              </p>
            </details>
          )}

          {(onApprove || onReject) && (
            <div className="mt-3 flex items-center gap-2">
              {onApprove && (
                <button
                  type="button"
                  onClick={onApprove}
                  disabled={isApproving}
                  className="px-2.5 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {isApproving ? "Approving…" : "Approve"}
                </button>
              )}
              {onReject && (
                <RejectWithReasonButton
                  onReject={onReject}
                  disabled={isRejecting}
                  isRejecting={isRejecting}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function RejectWithReasonButton({
  onReject,
  disabled,
  isRejecting,
}: {
  onReject: (reason: string) => void;
  disabled?: boolean;
  isRejecting?: boolean;
}) {
  const handleClick = () => {
    const reason = window.prompt("Enter rejection reason (optional):", "");
    if (reason !== null) {
      onReject(reason);
    }
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="px-2.5 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
    >
      {isRejecting ? "Rejecting…" : "Reject"}
    </button>
  );
}
