import {
  CheckCircle,
  Spinner,
  XCircle,
  ArrowClockwise,
} from "@phosphor-icons/react";
import { useCallback, useEffect } from "react";
import { FileDAO } from "../../dao/file-dao";
import {
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "../../services/auth-service";
import { API_CONFIG } from "../../shared-config";

interface FileStatusIndicatorProps {
  className?: string;
  initialStatus?: string;
  jobId?: string;
  ragId?: string;
  tenant: string;
  fileKey?: string;
  fileName?: string;
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
  onRetry,
}: FileStatusIndicatorProps) {
  // No local error timeout; rely on SSE-driven updates and server state

  // Manual refresh function to check AutoRAG status
  const handleRefresh = useCallback(async () => {
    try {
      const jwt = getStoredJwt();
      if (!jwt) return;

      // Use the new refresh all statuses endpoint from API_CONFIG
      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.ENDPOINTS.AUTORAG.REFRESH_ALL_FILE_STATUSES,
        {
          method: "POST",
          jwt,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: _tenant,
          }),
        }
      );

      if (jwtExpired) {
        console.warn(
          "[FileStatusIndicator] JWT expired while refreshing file statuses"
        );
        return;
      }

      if (response.ok) {
        const result = (await response.json()) as {
          success: boolean;
          updatedCount: number;
          results: Array<{ filename: string; updated: boolean }>;
        };

        if (result.success && result.updatedCount > 0) {
          // Trigger a custom event to refresh the ResourceList data instead of page reload
          window.dispatchEvent(
            new CustomEvent("file-status-updated", {
              detail: { updatedCount: result.updatedCount },
            })
          );
        } else {
        }
      }
    } catch (error) {
      console.error("Error checking file status:", error);
    }
  }, [_tenant]);

  // Refresh when SSE says file statuses changed
  useEffect(() => {
    const onUpdate = (_e: Event) => {
      handleRefresh();
    };
    window.addEventListener("file-status-updated", onUpdate);
    window.addEventListener("file-changed", onUpdate as EventListener);
    // Initial best-effort refresh for processing files
    if (
      initialStatus === FileDAO.STATUS.PROCESSING ||
      initialStatus === FileDAO.STATUS.UPLOADED
    ) {
      handleRefresh();
    }
    return () => {
      window.removeEventListener("file-status-updated", onUpdate);
      window.removeEventListener("file-changed", onUpdate as EventListener);
    };
  }, [handleRefresh, initialStatus]);

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
      text: "Processing",
      title: "AutoRAG is processing the file",
      spinning: true,
    },
    [FileDAO.STATUS.INDEXING]: {
      icon: Spinner,
      color: "text-blue-500",
      text: "Indexing",
      title: "File is being indexed for search",
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
