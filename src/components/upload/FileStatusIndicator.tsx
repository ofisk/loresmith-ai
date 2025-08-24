import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Spinner } from "@phosphor-icons/react";
import { useAutoRAGPolling } from "../../hooks/useAutoRAGPolling";

interface FileStatusIndicatorProps {
  filename: string;
  tenant: string;
  className?: string;
  initialStatus?: string;
  jobId?: string;
  ragId?: string;
}

export function FileStatusIndicator({
  className = "",
  initialStatus = "uploaded",
  jobId,
  ragId,
}: FileStatusIndicatorProps) {
  const [showError, setShowError] = useState(false);
  const { jobStatus, isPolling, startPolling, stopPolling } =
    useAutoRAGPolling();

  // Start polling if we have job details and the file is still pending
  useEffect(() => {
    if (
      jobId &&
      ragId &&
      (initialStatus === "uploaded" || initialStatus === "processing")
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

  // Determine what to show based on status
  const statusConfig = {
    error: {
      icon: XCircle,
      color: "text-red-500",
      text: "Failed",
      title: "Processing failed",
      spinning: false,
    },
    ready: {
      icon: CheckCircle,
      color: "text-green-500",
      text: "Ready",
      title: "File indexed and ready",
      spinning: false,
    },
    processed: {
      icon: CheckCircle,
      color: "text-green-500",
      text: "Ready",
      title: "File indexed and ready",
      spinning: false,
    },
    processing: {
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
    currentStatus = "error";
  } else if (jobStatus?.ended_at) {
    // Job completed
    const isSuccess =
      !jobStatus.end_reason || jobStatus.end_reason === "completed";
    currentStatus = isSuccess ? "ready" : "error";
  } else if (jobStatus?.started_at) {
    // Job is running
    currentStatus = "processing";
  } else {
    // Fall back to initial status
    currentStatus = initialStatus === "processed" ? "processed" : "processing";
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
