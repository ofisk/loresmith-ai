import { useCallback, useEffect, useState } from "react";
import { getStoredJwt } from "../../services/auth-service";
import { API_CONFIG } from "../../shared";
import { Loader } from "../loader/Loader";
import { useAuthReady } from "../../hooks/useAuthReady";

interface StorageUsage {
  username: string;
  totalBytes: number;
  fileCount: number;
  isAdmin: boolean;
  limitBytes: number;
  remainingBytes: number;
  usagePercentage: number;
}

export function StorageTracker() {
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authReady = useAuthReady();

  const fetchStorageUsage = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const jwt = getStoredJwt();
      if (!jwt) {
        setError("Authentication required");
        return;
      }

      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.STORAGE_USAGE),
        {
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch storage usage: ${response.status}`);
      }

      const responseData = (await response.json()) as {
        success: boolean;
        usage?: StorageUsage;
      };
      if (responseData.success && responseData.usage) {
        setStorageUsage(responseData.usage);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      console.error("Failed to fetch storage usage:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch storage usage"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch storage usage when auth becomes ready
  useEffect(() => {
    if (authReady) {
      fetchStorageUsage();
    }
  }, [authReady, fetchStorageUsage]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  // Don't show anything if auth is not ready yet
  if (!authReady) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader size={16} />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 text-sm p-2">Error: {error}</div>;
  }

  if (!storageUsage) {
    return null;
  }

  return (
    <div className="p-4 border-t border-gray-200 dark:border-gray-700">
      <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
        Storage Usage
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>Used: {formatBytes(storageUsage.totalBytes || 0)}</span>
        <span className="text-gray-500">
          {(storageUsage.usagePercentage || 0).toFixed(1)}%
        </span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(storageUsage.usagePercentage || 0, 100)}%`,
          }}
        />
      </div>
    </div>
  );
}
