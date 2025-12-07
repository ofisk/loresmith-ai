import { CheckCircle, Spinner, XCircle, Clock } from "@phosphor-icons/react";
import type { RebuildStatus } from "@/dao/rebuild-status-dao";

interface RebuildStatusIndicatorProps {
  className?: string;
  rebuildStatus: RebuildStatus | null;
}

export function RebuildStatusIndicator({
  className = "",
  rebuildStatus,
}: RebuildStatusIndicatorProps) {
  if (!rebuildStatus) {
    return null;
  }

  // Determine what to show based on status
  const statusConfig = {
    pending: {
      icon: Clock,
      color: "text-yellow-500",
      text: "Queued",
      title: "Rebuild is queued and waiting to start",
      spinning: false,
    },
    in_progress: {
      icon: Spinner,
      color: "text-blue-500",
      text: "Rebuilding",
      title: "Graph rebuild in progress",
      spinning: true,
    },
    completed: {
      icon: CheckCircle,
      color: "text-green-500",
      text: "Complete",
      title: "Rebuild completed successfully",
      spinning: false,
    },
    failed: {
      icon: XCircle,
      color: "text-red-500",
      text: "Failed",
      title: rebuildStatus.errorMessage || "Rebuild failed",
      spinning: false,
    },
    cancelled: {
      icon: XCircle,
      color: "text-gray-500",
      text: "Cancelled",
      title: "Rebuild was cancelled",
      spinning: false,
    },
  };

  const config = statusConfig[rebuildStatus.status];
  if (!config) {
    return null;
  }

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
