import { useEffect, useState } from "react";
import { HardDrive, Infinity as InfinityIcon } from "@phosphor-icons/react";
import { API_CONFIG } from "../../shared";
import { JWT_STORAGE_KEY } from "../../constants";

interface StorageUsage {
  username: string;
  totalBytes: number;
  fileCount: number;
  isAdmin: boolean;
  limitBytes: number;
  remainingBytes: number;
  usagePercentage: number;
}

interface StorageTrackerProps {
  className?: string;
}

export function StorageTracker({ className = "" }: StorageTrackerProps) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStorageUsage = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const jwt = localStorage.getItem(JWT_STORAGE_KEY);
        if (!jwt) {
          setError("Not authenticated");
          return;
        }

        const response = await fetch(
          `${API_CONFIG.getApiBaseUrl()}/library/storage-usage`,
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
            },
          }
        );

        if (response.ok) {
          const data = (await response.json()) as { usage: StorageUsage };
          setUsage(data.usage);
        } else {
          setError("Failed to fetch storage usage");
        }
      } catch (err) {
        setError("Error loading storage info");
        console.error("Error fetching storage usage:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStorageUsage();

    // Refresh every 30 seconds
    const interval = setInterval(fetchStorageUsage, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) {
      return "0 B";
    }
    if (bytes === Infinity) {
      return "∞";
    }
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  const getUsageColor = (percentage: number): string => {
    if (percentage >= 90) return "text-red-600";
    if (percentage >= 75) return "text-orange-600";
    if (percentage >= 50) return "text-yellow-600";
    return "text-green-600";
  };

  if (isLoading) {
    return (
      <div
        className={`p-4 border-t border-neutral-200 dark:border-neutral-700 ${className}`}
      >
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
          Loading storage info...
        </div>
      </div>
    );
  }

  if (error || !usage) {
    return (
      <div
        className={`p-4 border-t border-neutral-200 dark:border-neutral-700 ${className}`}
      >
        <div className="text-sm text-red-600 dark:text-red-400">
          {error || "Storage info unavailable"}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`p-4 border-t border-neutral-200 dark:border-neutral-700 ${className}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <HardDrive size={16} className="text-purple-600" />
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Storage Usage
        </span>
      </div>

      <div className="space-y-2">
        {/* Usage Bar */}
        {!usage.isAdmin && (
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                usage.usagePercentage >= 90
                  ? "bg-red-500"
                  : usage.usagePercentage >= 75
                    ? "bg-orange-500"
                    : usage.usagePercentage >= 50
                      ? "bg-yellow-500"
                      : "bg-green-500"
              }`}
              style={{ width: `${Math.min(usage.usagePercentage, 100)}%` }}
            />
          </div>
        )}

        {/* Usage Text */}
        <div className="text-xs space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Used:</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {formatBytes(usage.totalBytes)}
            </span>
          </div>

          {!usage.isAdmin && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Limit:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatBytes(usage.limitBytes)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">
                  Remaining:
                </span>
                <span
                  className={`font-medium ${getUsageColor(usage.usagePercentage)}`}
                >
                  {formatBytes(usage.remainingBytes)}
                </span>
              </div>
            </>
          )}

          {usage.isAdmin && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Limit:</span>
              <span className="font-medium text-purple-600 flex items-center gap-1">
                <InfinityIcon size={12} />
                Unlimited
              </span>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Files:</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {usage.fileCount}
            </span>
          </div>
        </div>

        {/* Admin Badge */}
        {usage.isAdmin && (
          <div className="mt-2">
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
              <InfinityIcon size={10} className="mr-1" />
              Admin Access
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
