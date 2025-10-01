import {
  CheckCircle,
  Spinner,
  XCircle,
  ArrowClockwise,
} from "@phosphor-icons/react";
import { useCallback } from "react";
import { FileDAO } from "../../dao/file-dao";
import {
  estimateProcessingTime,
  formatProcessingTime,
} from "../../utils/processing-time-estimator";

interface FileStatusIndicatorProps {
  className?: string;
  initialStatus?: string;
  jobId?: string;
  ragId?: string;
  tenant: string;
  fileKey?: string;
  fileName?: string;
  fileSize?: number;
  onRetry?: (fileKey: string, fileName: string) => void;
}

export function FileStatusIndicator({
  className = "",
  initialStatus = "uploaded",
  jobId: _jobId,
  ragId: _ragId,
  tenant: _tenant,
  fileKey,
  fileName,
  fileSize,
  onRetry,
}: FileStatusIndicatorProps) {
  // No local error timeout; rely on SSE-driven updates and server state

  // FileStatusIndicator now only displays status - refresh logic moved to ResourceList
  // This prevents multiple components from making duplicate refresh-all-statuses calls

  // Get processing time estimate if file size is available
  const processingEstimate = fileSize ? estimateProcessingTime(fileSize) : null;
  const timeEstimate = processingEstimate
    ? formatProcessingTime(processingEstimate)
    : null;

  // Determine what to show based on status
  const statusConfig = {
    [FileDAO.STATUS.ERROR]: {
      icon: XCircle,
      color: "text-red-500",
      text: "Failed",
      title: "Processing failed",
      spinning: false,
    },
    [FileDAO.STATUS.COMPLETED]: {
      icon: CheckCircle,
      color: "text-green-500",
      text: "Ready",
      title: "File is indexed and searchable",
      spinning: false,
    },
    [FileDAO.STATUS.UPLOADING]: {
      icon: Spinner,
      color: "text-blue-500",
      text: "Uploading",
      title: "Uploading file to storage",
      spinning: true,
    },
    [FileDAO.STATUS.UPLOADED]: {
      icon: Spinner,
      color: "text-blue-500",
      text: "Queued",
      title: "File uploaded, waiting for AutoRAG processing",
      spinning: true,
    },
    [FileDAO.STATUS.SYNCING]: {
      icon: Spinner,
      color: "text-blue-500",
      text: "Syncing",
      title: "Starting AutoRAG sync job",
      spinning: true,
    },
    [FileDAO.STATUS.PROCESSING]: {
      icon: Spinner,
      color: "text-blue-500",
      text: timeEstimate ? `Processing (~${timeEstimate})` : "Processing",
      title: timeEstimate
        ? `AutoRAG is processing the file. Estimated time: ${timeEstimate}`
        : "AutoRAG is processing the file",
      spinning: true,
    },
    [FileDAO.STATUS.INDEXING]: {
      icon: Spinner,
      color: "text-blue-500",
      text: timeEstimate ? `Indexing (~${timeEstimate})` : "Indexing",
      title: timeEstimate
        ? `File is being indexed for search. Estimated time: ${timeEstimate}`
        : "File is being indexed for search",
      spinning: true,
    },
    [FileDAO.STATUS.UNINDEXED]: {
      icon: XCircle,
      color: "text-orange-500",
      text: "Not Indexed",
      title: "File not indexed by AutoRAG - shard generation will fail",
      spinning: false,
    },
  };

  // Get current status
  let currentStatus: keyof typeof statusConfig;
  // Fall back to initial status
  if (initialStatus === FileDAO.STATUS.COMPLETED) {
    currentStatus = FileDAO.STATUS.COMPLETED;
  } else if (initialStatus === FileDAO.STATUS.ERROR) {
    currentStatus = FileDAO.STATUS.ERROR;
  } else if (initialStatus === FileDAO.STATUS.UNINDEXED) {
    currentStatus = FileDAO.STATUS.UNINDEXED;
  } else {
    currentStatus = FileDAO.STATUS.PROCESSING;
  }

  const config = statusConfig[currentStatus];
  const IconComponent = config.icon;

  const handleRetry = useCallback(() => {
    if (fileKey && fileName && onRetry) {
      onRetry(fileKey, fileName);
    }
  }, [fileKey, fileName, onRetry]);

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <div
        className={`flex items-center gap-1 ${config.color}`}
        title={config.title}
      >
        <IconComponent
          size={14}
          className={config.spinning ? "animate-spin" : ""}
        />
        <span className="text-xs">{config.text}</span>
      </div>

      {/* Show retry button for failed files */}
      {currentStatus === FileDAO.STATUS.ERROR &&
        fileKey &&
        fileName &&
        onRetry && (
          <button
            type="button"
            onClick={handleRetry}
            className="ml-1 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            title="Retry processing"
          >
            <ArrowClockwise size={12} />
          </button>
        )}
    </div>
  );
}
