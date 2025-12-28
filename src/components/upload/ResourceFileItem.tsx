import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { AuthService } from "@/services/core/auth-service";
import { FileStatusIndicator } from "@/components/upload/FileStatusIndicator";
import { Tooltip } from "@/components/tooltip/Tooltip";
import { ResourceFileDetails } from "./ResourceFileDetails";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";
import { FileDAO } from "@/dao/file-dao";
import type { Campaign } from "@/types/campaign";
import { getDisplayName } from "@/lib/display-name-utils";

interface ResourceFileItemProps {
  file: ResourceFileWithCampaigns;
  progress: number | undefined;
  campaignProgress: number | undefined;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRetryFile: (fileKey: string, fileName: string) => Promise<void>;
  onAddToCampaign?: (file: ResourceFileWithCampaigns) => void;
  onEditFile?: (file: ResourceFileWithCampaigns) => void;
  onRetryIndexing: (fileKey: string) => Promise<void>;
  fetchResources: () => Promise<void>;
  campaigns?: Campaign[];
}

/**
 * Individual resource file item component
 */
export function ResourceFileItem({
  file,
  progress,
  campaignProgress,
  isExpanded,
  onToggleExpand,
  onRetryFile,
  onAddToCampaign,
  onEditFile,
  onRetryIndexing,
  fetchResources,
  campaigns = [],
}: ResourceFileItemProps) {
  const progressPercentage = (() => {
    // Check for campaign addition progress first
    if (typeof campaignProgress === "number") {
      return campaignProgress;
    }

    // Then check for file upload progress
    if (typeof progress === "number") {
      return progress;
    }

    // Progress based on status
    switch (file.status) {
      case FileDAO.STATUS.UPLOADING:
        return 20;
      case FileDAO.STATUS.UPLOADED:
        return 40;
      case FileDAO.STATUS.SYNCING:
        return 60;
      case FileDAO.STATUS.PROCESSING:
        return 80;
      case FileDAO.STATUS.INDEXING:
        return 90;
      case FileDAO.STATUS.COMPLETED:
        return 100;
      case FileDAO.STATUS.ERROR:
        return 100;
      default:
        return undefined;
    }
  })();

  const progressColor = (() => {
    // Check for campaign addition progress first
    if (typeof campaignProgress === "number") {
      return "rgba(147, 51, 234, 0.12)"; // Purple for campaign addition
    }

    // Then check for file status
    return file.status === "error"
      ? "rgba(239,68,68,0.15)"
      : "rgba(147,197,253,0.12)";
  })();

  return (
    <button
      type="button"
      className="relative p-2 border rounded-lg bg-white dark:bg-neutral-900 shadow-sm border-neutral-200 dark:border-neutral-800 overflow-hidden cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors duration-200 w-full text-left"
      onClick={onToggleExpand}
    >
      {/* Progress fill (transparent overlay) */}
      {progressPercentage !== undefined && (
        <div
          className="absolute inset-y-0 left-0 pointer-events-none"
          style={{
            width: `${progressPercentage}%`,
            transition: "width 300ms ease",
            background: progressColor,
          }}
        />
      )}
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 mr-3 min-w-0">
            <Tooltip content={getDisplayName(file)} id={file.file_key}>
              <h4
                className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate cursor-help max-w-[200px]"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
              >
                {getDisplayName(file)}
              </h4>
            </Tooltip>
            {AuthService.getUsernameFromStoredJwt() && (
              <FileStatusIndicator
                tenant={AuthService.getUsernameFromStoredJwt()!}
                initialStatus={file.status}
                fileKey={file.file_key}
                fileName={file.file_name}
                fileSize={file.file_size}
                processingError={file.processing_error}
                onRetry={onRetryFile}
                className="flex-shrink-0"
              />
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            type="button"
            className="flex-shrink-0 p-1 rounded-md bg-neutral-200 dark:bg-neutral-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors duration-200"
          >
            {isExpanded ? (
              <CaretDownIcon
                size={16}
                className="text-purple-600 dark:text-purple-400"
              />
            ) : (
              <CaretRightIcon
                size={16}
                className="text-purple-600 dark:text-purple-400"
              />
            )}
          </button>
        </div>

        {isExpanded && (
          <ResourceFileDetails
            file={file}
            onAddToCampaign={onAddToCampaign}
            onEditFile={onEditFile}
            onRetryIndexing={onRetryIndexing}
            fetchResources={fetchResources}
            campaigns={campaigns}
          />
        )}
      </div>
    </button>
  );
}
