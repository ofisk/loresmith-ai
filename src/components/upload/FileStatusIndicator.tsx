import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Spinner } from "@phosphor-icons/react";
import { useAutoRAGPolling } from "../../hooks/useAutoRAGPolling";

interface FileStatusIndicatorProps {
  filename: string;
  tenant: string;
  className?: string;
  initialStatus?: string;
}

export function FileStatusIndicator({
  filename,
  tenant,
  className = "",
  initialStatus = "uploaded",
}: FileStatusIndicatorProps) {
  const [showError, setShowError] = useState(false);
  const { status, isPolling, startPolling, stopPolling } = useAutoRAGPolling();

  // Only start polling if the file is still pending AutoRAG processing
  useEffect(() => {
    if (initialStatus === "uploaded" || initialStatus === "processing") {
      startPolling(tenant, filename);

      // Set a timeout to show error after 1 minute if still polling
      const errorTimeout = setTimeout(() => {
        if (isPolling) {
          setShowError(true);
          stopPolling();
        }
      }, 60000); // 1 minute

      return () => {
        clearTimeout(errorTimeout);
        stopPolling();
      };
    }
  }, [filename, tenant, startPolling, stopPolling, isPolling, initialStatus]);

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

  // Priority: showError > AutoRAG API status > database status > default
  const currentStatus = showError
    ? "error"
    : status?.status === "ready"
      ? "ready"
      : status?.status === "error"
        ? "error"
        : initialStatus === "processed"
          ? "processed"
          : initialStatus === "error"
            ? "error"
            : "processing";

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
