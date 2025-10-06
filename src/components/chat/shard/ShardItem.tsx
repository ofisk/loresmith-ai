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
    <div className="border border-neutral-600 dark:border-neutral-700 rounded-lg p-3 bg-neutral-800 dark:bg-neutral-800">
      <div className="flex items-start space-x-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelectionChange(shard.id, e.target.checked)}
          className="mt-1 rounded border-neutral-600 dark:border-neutral-500 bg-neutral-700 dark:bg-neutral-700 text-white"
        />

        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-600 dark:bg-purple-600 text-white">
              {shard.metadata.entityType}
            </span>
            {typeof shard.metadata.confidence === "number" &&
              !Number.isNaN(shard.metadata.confidence) && (
                <span className="text-sm text-neutral-300 dark:text-neutral-300">
                  Confidence: {Math.round(shard.metadata.confidence * 100)}%
                </span>
              )}
          </div>

          <p className="text-neutral-200 dark:text-neutral-200 whitespace-pre-wrap text-sm">
            {shard.text}
          </p>

          {shard.metadata.query && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-neutral-400 dark:text-neutral-400 hover:text-neutral-200 dark:hover:text-neutral-200">
                View Query
              </summary>
              <p className="mt-1 p-2 bg-neutral-700 dark:bg-neutral-700 rounded text-xs text-neutral-200 dark:text-neutral-200">
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
