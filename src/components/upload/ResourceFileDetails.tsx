import { Button } from "@/components/button/Button";
import { FileDAO } from "@/dao/file-dao";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";

interface ResourceFileDetailsProps {
  file: ResourceFileWithCampaigns;
  onAddToCampaign?: (file: ResourceFileWithCampaigns) => void;
  onEditFile?: (file: ResourceFileWithCampaigns) => void;
  onRetryIndexing: (fileKey: string) => Promise<void>;
  fetchResources: () => Promise<void>;
}

/**
 * Expanded file details component
 */
export function ResourceFileDetails({
  file,
  onAddToCampaign,
  onEditFile,
  onRetryIndexing,
  fetchResources,
}: ResourceFileDetailsProps) {
  const handleRetryIndexing = async () => {
    await onRetryIndexing(file.file_key);
    await fetchResources();
  };

  return (
    <div
      className={`overflow-hidden transition-all duration-300 ease-in-out max-h-96 opacity-100`}
    >
      <div className="mt-4 text-xs space-y-1">
        {file.display_name && (
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">
              Display name:
            </span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {file.display_name}
            </span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-gray-600 dark:text-gray-400">Filename:</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {file.file_name}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600 dark:text-gray-400">Uploaded:</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {new Date(file.created_at || file.updated_at)
              .toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "2-digit",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })
              .replace(",", "")
              .replace(" PM", "p")
              .replace(" AM", "a")}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600 dark:text-gray-400">Size:</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {file.file_size
              ? (file.file_size / 1024 / 1024).toFixed(2)
              : "Unknown"}{" "}
            MB
          </span>
        </div>
      </div>

      {file.description && (
        <div className="mt-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {file.description}
          </p>
        </div>
      )}
      {file.tags && Array.isArray(file.tags) && file.tags.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1">
            {file.tags.map((tag: string) => (
              <span
                key={tag}
                className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {file.campaigns && file.campaigns.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Linked campaigns:
          </p>
          <div className="flex flex-wrap gap-1">
            {file.campaigns.map((campaign) => (
              <span
                key={campaign.campaignId}
                className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300 rounded"
              >
                {campaign.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {(file.status === FileDAO.STATUS.UNINDEXED ||
          file.status === FileDAO.STATUS.ERROR) && (
          <Button
            onClick={handleRetryIndexing}
            variant="secondary"
            size="sm"
            className="w-full !text-orange-600 dark:!text-orange-400 hover:!text-orange-700 dark:hover:!text-orange-300 border-orange-200 dark:border-orange-700 hover:border-orange-300 dark:hover:border-orange-600"
          >
            Retry Indexing
          </Button>
        )}
        <Button
          onClick={() => {
            onAddToCampaign?.(file);
          }}
          variant="secondary"
          size="sm"
          className="w-full !text-purple-600 dark:!text-purple-400 hover:!text-purple-700 dark:hover:!text-purple-300 border-purple-200 dark:border-purple-700 hover:border-purple-300 dark:hover:border-purple-600"
          disabled={file.status !== FileDAO.STATUS.COMPLETED}
        >
          {file.status === FileDAO.STATUS.COMPLETED
            ? "Add to campaign"
            : "File Not Ready"}
        </Button>
        <Button
          onClick={() => {
            onEditFile?.(file);
          }}
          variant="secondary"
          size="sm"
          className="w-full text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
        >
          Edit
        </Button>
      </div>
    </div>
  );
}
