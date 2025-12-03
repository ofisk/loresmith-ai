import { useCallback, useEffect, useState } from "react";
import { API_CONFIG } from "@/shared-config";
import {
  authenticatedFetchWithExpiration,
  getStoredJwt,
  AuthService,
} from "@/services/core/auth-service";
import type { Campaign } from "@/types/campaign";
import { useAuthReady } from "@/hooks/useAuthReady";
import { Button } from "@/components/button/Button";
import { useResourceFiles } from "@/hooks/useResourceFiles";
import { useResourceFileEvents } from "@/hooks/useResourceFileEvents";
import { ResourceFileItem } from "./ResourceFileItem";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";
import { logger } from "@/lib/logger";

interface ResourceListProps {
  onAddToCampaign?: (file: ResourceFileWithCampaigns) => void;
  onEditFile?: (file: ResourceFileWithCampaigns) => void;
  campaigns?: Campaign[];
  campaignAdditionProgress?: Record<string, number>;
  _isAddingToCampaigns?: boolean;
}

/**
 * ResourceList component - displays a list of uploaded files with their status and details
 */
export function ResourceList({
  onAddToCampaign,
  onEditFile,
  campaigns = [],
  campaignAdditionProgress = {},
  _isAddingToCampaigns = false,
}: ResourceListProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [progressByFileKey, setProgressByFileKey] = useState<
    Record<string, number>
  >({});
  const authReady = useAuthReady();

  // File data management
  const {
    files,
    loading,
    error,
    fetchResources,
    setFiles,
    setError,
    setLoading,
  } = useResourceFiles({ campaigns });

  // File event handling - manages progress state internally and via prop setter
  useResourceFileEvents({
    files,
    setFiles,
    setProgressByFileKey,
    fetchResources,
  });

  const handleRetryFile = useCallback(
    async (fileKey: string, fileName: string) => {
      try {
        console.log(`[ResourceList] Retrying file processing for: ${fileName}`);

        // Immediately update UI to show retry in progress
        setProgressByFileKey((prev) => ({ ...prev, [fileKey]: 0 }));

        const jwt = getStoredJwt();
        if (!jwt) {
          console.error("[ResourceList] No JWT token available for retry");
          return;
        }

        // Call the RAG trigger indexing endpoint to retry processing for existing files
        const retryUrl = API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.RAG.TRIGGER_INDEXING
        );
        const response = await authenticatedFetchWithExpiration(retryUrl, {
          method: "POST",
          jwt,
          body: JSON.stringify({ fileKey }),
          headers: {
            "Content-Type": "application/json",
          },
        });

        // Parse response (server always returns JSON, even for errors)
        const result = (await response.response.json()) as {
          success: boolean;
          message?: string;
          error?: string;
          queued: boolean;
          isIndexed?: boolean;
        };

        console.log(`[ResourceList] Retry response for ${fileName}:`, result);

        // Check for errors: either HTTP error status or success: false in response
        if (!response.response.ok || !result.success) {
          const errorMessage =
            result.message ||
            result.error ||
            `Retry failed with status ${response.response.status}`;
          console.error(
            `[ResourceList] Retry failed for ${fileName}:`,
            errorMessage
          );
          throw new Error(errorMessage);
        }

        // If queued, show immediate feedback
        if (result.queued) {
          console.log(`[ResourceList] File ${fileName} queued for retry`);
        } else {
          console.log(
            `[ResourceList] File ${fileName} retry started immediately`
          );
          // Start progress animation for immediate retry
          setProgressByFileKey((prev) => ({ ...prev, [fileKey]: 25 }));
        }

        // Refresh the file list to show updated status
        fetchResources();
      } catch (error) {
        console.error(
          `[ResourceList] Failed to retry file processing for ${fileName}:`,
          error
        );
        // Reset progress on error
        setProgressByFileKey((prev) => {
          const newProgress = { ...prev };
          delete newProgress[fileKey];
          return newProgress;
        });
      }
    },
    [fetchResources]
  );

  const handleRetryIndexing = useCallback(
    async (fileKey: string) => {
      try {
        const jwt = getStoredJwt();
        if (!jwt) return;

        const { response } = await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.RAG.TRIGGER_INDEXING),
          {
            method: "POST",
            jwt,
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fileKey,
            }),
          }
        );

        if (response.ok) {
          // Refresh the file list to show updated status
          await fetchResources();
        }
      } catch (error) {
        console.error("Failed to retry indexing:", error);
        setError("Failed to retry indexing. Please try again.");
      }
    },
    [fetchResources, setError]
  );

  const toggleFileExpansion = useCallback((fileKey: string) => {
    setExpandedFiles((prev) => {
      const newExpandedFiles = new Set(prev);
      if (newExpandedFiles.has(fileKey)) {
        newExpandedFiles.delete(fileKey);
      } else {
        newExpandedFiles.add(fileKey);
      }
      return newExpandedFiles;
    });
  }, []);

  // Initial load - run when authentication becomes ready
  useEffect(() => {
    if (authReady) {
      // Reset loading state and fetch resources when auth becomes ready
      const log = logger.scope("[ResourceList]");
      log.debug("Auth ready, fetching resources");
      setLoading(true);
      setError(null);
      fetchResources();
    } else {
      // If auth is not ready (e.g., JWT expired), clear loading state
      // to prevent infinite "Loading resources..." display
      const jwt = getStoredJwt();
      if (jwt) {
        // JWT exists but is expired - clear loading state
        // The auth modal will be shown by useAppState
        setError(null);
        setLoading(false);
      } else {
        // No JWT - clear loading state and set error
        setError("Please authenticate to view resources.");
        setLoading(false);
      }
    }
  }, [authReady, fetchResources, setLoading, setError]);

  // Also listen for jwt-changed events to refresh immediately after authentication
  useEffect(() => {
    const handleJwtChanged = () => {
      const log = logger.scope("[ResourceList]");
      const jwt = getStoredJwt();
      log.debug("JWT changed event received", { hasJwt: !!jwt, authReady });
      // Check if JWT exists and is valid (not expired)
      if (jwt) {
        const isExpired = AuthService.isJwtExpired(jwt);
        if (!isExpired) {
          // JWT is valid - refresh resources immediately
          // authReady will update shortly via useAuthReady's polling
          log.info("JWT is valid, refreshing resources after authentication");
          setLoading(true);
          setError(null);
          fetchResources();
        } else {
          log.debug("JWT changed but is expired, waiting for authReady");
        }
      }
    };

    window.addEventListener("jwt-changed", handleJwtChanged as EventListener);
    return () => {
      window.removeEventListener(
        "jwt-changed",
        handleJwtChanged as EventListener
      );
    };
  }, [fetchResources, setLoading, setError, authReady]);

  // Listen for campaign changes to refresh campaign associations
  useEffect(() => {
    const handleCampaignChange = () => {
      console.log(
        "[ResourceList] Received campaign change event, refreshing campaign data"
      );
      // Re-fetch campaign associations for all files
      fetchResources();
    };

    // Listen for campaign-related events
    window.addEventListener(
      "campaign-created",
      handleCampaignChange as EventListener
    );
    window.addEventListener(
      "campaign-file-added",
      handleCampaignChange as EventListener
    );
    window.addEventListener(
      "campaign-file-removed",
      handleCampaignChange as EventListener
    );

    return () => {
      window.removeEventListener(
        "campaign-created",
        handleCampaignChange as EventListener
      );
      window.removeEventListener(
        "campaign-file-added",
        handleCampaignChange as EventListener
      );
      window.removeEventListener(
        "campaign-file-removed",
        handleCampaignChange as EventListener
      );
    };
  }, [fetchResources]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-gray-500">Loading resources...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 mb-2">{error}</div>
        <Button
          onClick={() => {
            const log = logger.scope("[ResourceList]");
            log.debug("Retry button clicked");
            const jwt = getStoredJwt();
            log.debug("Current auth state", {
              authReady,
              hasJwt: !!jwt,
            });

            if (!authReady || !jwt) {
              log.warn("Auth not ready or no JWT - triggering auth modal");
              // Dispatch jwt-expired event to trigger auth modal
              window.dispatchEvent(
                new CustomEvent("jwt-expired", {
                  detail: {
                    message: "Authentication required. Please sign in again.",
                  },
                })
              );
              return;
            }

            fetchResources();
          }}
          variant="secondary"
          size="sm"
          className="mx-auto"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500 mb-2">The shelves lie bare</div>
        <p className="text-sm text-gray-400">
          Place a scroll upon the archive to awaken it
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-3">
        {files.map((file) => (
          <ResourceFileItem
            key={file.file_key}
            file={file}
            progress={progressByFileKey[file.file_key]}
            campaignProgress={campaignAdditionProgress[file.file_key]}
            isExpanded={expandedFiles.has(file.file_key)}
            onToggleExpand={() => toggleFileExpansion(file.file_key)}
            onRetryFile={handleRetryFile}
            onAddToCampaign={onAddToCampaign}
            onEditFile={onEditFile}
            onRetryIndexing={handleRetryIndexing}
            fetchResources={fetchResources}
          />
        ))}
      </div>
    </div>
  );
}
