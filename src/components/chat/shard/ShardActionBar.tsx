import { Button } from "../../button/Button";

interface ShardActionBarProps {
  selectedCount: number;
  processing: string | null;
  action: string;
  rejectionReason: string;
  onRejectionReasonChange: (reason: string) => void;
  onApprove: () => void;
  onReject: () => void;
}

export const ShardActionBar: React.FC<ShardActionBarProps> = ({
  selectedCount,
  processing,
  action,
  rejectionReason,
  onRejectionReasonChange,
  onApprove,
  onReject,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="bg-purple-900 dark:bg-purple-900 border border-purple-700 dark:border-purple-700 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <p className="text-purple-200 dark:text-purple-200">
          {selectedCount} shard{selectedCount !== 1 ? "s" : ""} selected
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
              : `Approve ${selectedCount}`}
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
              : `Reject ${selectedCount}`}
          </Button>
        </div>
      </div>

      {action === "show_staged" && (
        <div className="mt-2">
          <input
            type="text"
            placeholder="Reason for rejection (required)"
            value={rejectionReason}
            onChange={(e) => onRejectionReasonChange(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-600 dark:border-neutral-600 bg-neutral-700 dark:bg-neutral-700 text-white placeholder-neutral-400 dark:placeholder-neutral-400 rounded-md text-sm"
          />
        </div>
      )}
    </div>
  );
};
