import { CheckCircle, Spinner, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { JWT_STORAGE_KEY } from "../../constants";
import { FileDAO } from "../../dao/file-dao";
import { useAutoRAGPolling } from "../../hooks/useAutoRAGPolling";
import { authenticatedFetchWithExpiration } from "../../services/auth-service";
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
  jobId,
  ragId,
  tenant,
}: FileStatusIndicatorProps) {
  const [showError, setShowError] = useState(false);
  const { jobStatus, isPolling, startPolling, stopPolling } =
    useAutoRAGPolling();

  // Start polling if we have job details and the file is still pending
  useEffect(() => {
    if (
      jobId &&
      ragId &&
      (initialStatus === FileDAO.STATUS.UPLOADED ||
        initialStatus === FileDAO.STATUS.PROCESSING)
    ) {
      startPolling(ragId, jobId);

      // Set a timeout to show error after 2 minutes if still polling
      const errorTimeout = setTimeout(() => {
        if (isPolling) {
          setShowError(true);
          stopPolling();
        }
      }, 120000); // 2 minutes

      return () => {
        clearTimeout(errorTimeout);
        stopPolling();
      };
    }
  }, [jobId, ragId, initialStatus, startPolling, stopPolling, isPolling]);

  // Manual refresh function to check AutoRAG status
  const handleRefresh = useCallback(async () => {
    try {
      const jwt = localStorage.getItem(JWT_STORAGE_KEY);
      if (!jwt) {
        throw new Error("No JWT token available");
      }

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
          console.log(
            `[FileStatusIndicator] Updated ${result.updatedCount} file statuses`
          );
          // Trigger a custom event to refresh the ResourceList data instead of page reload
          window.dispatchEvent(
            new CustomEvent("file-status-updated", {
              detail: { updatedCount: result.updatedCount },
            })
          );
        } else {
          console.log("[FileStatusIndicator] No file statuses were updated");
        }
      }
    } catch (error) {
      console.error("Error checking file status:", error);
    }
  }, [tenant]);

  // Automatically refresh file statuses on component mount for processing files
  useEffect(() => {
    if (
      initialStatus === FileDAO.STATUS.PROCESSING ||
      initialStatus === FileDAO.STATUS.UPLOADED
    ) {
      handleRefresh();
    }
  }, [handleRefresh, initialStatus]); // Include dependencies

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

  if (showError) {
    currentStatus = FileDAO.STATUS.ERROR;
  } else if (jobStatus?.ended_at) {
    // Job completed
    const isSuccess =
      !jobStatus.end_reason || jobStatus.end_reason === "completed";
    currentStatus = isSuccess ? FileDAO.STATUS.COMPLETED : FileDAO.STATUS.ERROR;
  } else if (jobStatus?.started_at) {
    // Job is running
    currentStatus = FileDAO.STATUS.PROCESSING;
  } else {
    // Fall back to initial status
    if (initialStatus === FileDAO.STATUS.COMPLETED) {
      currentStatus = FileDAO.STATUS.COMPLETED;
    } else if (initialStatus === FileDAO.STATUS.ERROR) {
      currentStatus = FileDAO.STATUS.ERROR;
    } else {
      currentStatus = FileDAO.STATUS.PROCESSING;
    }
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
