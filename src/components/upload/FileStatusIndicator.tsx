import { CheckCircle, Spinner, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect } from "react";
import { FileDAO } from "../../dao/file-dao";
import {
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "../../services/auth-service";
import { API_CONFIG } from "../../shared";

interface FileStatusIndicatorProps {
  className?: string;
  initialStatus?: string;
  jobId?: string;
  ragId?: string;
  tenant: string;
}

export function FileStatusIndicator({
  className = "",
  initialStatus = "uploaded",
  jobId: _jobId,
  ragId: _ragId,
  tenant,
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
            username: tenant,
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
  }, [tenant]);

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
      text: "Completed",
      title: "File processing completed",
      spinning: false,
    },
    [FileDAO.STATUS.PROCESSING]: {
      icon: Spinner,
      color: "text-blue-500",
      text: "Processing",
      title: "Processing with AutoRAG",
      spinning: true,
    },
  };

  // Get current status
  let currentStatus: keyof typeof statusConfig;
  // Fall back to initial status
  if (initialStatus === FileDAO.STATUS.COMPLETED) {
    currentStatus = FileDAO.STATUS.COMPLETED;
  } else if (initialStatus === FileDAO.STATUS.ERROR) {
    currentStatus = FileDAO.STATUS.ERROR;
  } else {
    currentStatus = FileDAO.STATUS.PROCESSING;
  }

  const config = statusConfig[currentStatus];
  const IconComponent = config.icon;

  return (
    <div
      className={`flex items-center gap-1 ${config.color} ${className}`}
      title={config.title}
    >
      <IconComponent
        size={14}
        className={config.spinning ? "animate-spin" : ""}
      />
      <span className="text-xs">{config.text}</span>
    </div>
  );
}
