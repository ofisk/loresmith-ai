import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ERROR_MESSAGES } from "../../app-constants";
import { FileDAO } from "../../dao/file-dao";
import type { AutoRAGEvent, FileUploadEvent } from "../../lib/event-bus";
import { EVENT_TYPES, useEventBus } from "../../lib/event-bus";
import {
  AuthService,
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "../../services/auth-service";
import { API_CONFIG } from "../../shared-config";
import type { Campaign } from "../../types/campaign";
import { useAuthReady } from "../../hooks/useAuthReady";
import { Button } from "../button/Button";
import { FileStatusIndicator } from "./FileStatusIndicator";
import { Tooltip } from "../tooltip/Tooltip";

interface ResourceListProps {
  onAddToCampaign?: (file: any) => void;
  onEditFile?: (file: any) => void;
  campaigns?: Campaign[];
  campaignAdditionProgress?: Record<string, number>;
  _isAddingToCampaigns?: boolean;
}

interface ResourceFile {
  id: string;
  file_key: string;
  file_name: string;
  file_size: number;
  description?: string;
  tags?: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

interface ResourceFileWithCampaigns extends ResourceFile {
  campaigns?: Campaign[];
}

function getDisplayName(filename: string | undefined | null): string {
  if (!filename) {
    return "Unknown file";
  }
  return filename;
}

export function ResourceList({
  onAddToCampaign,
  onEditFile,
  campaigns = [],
  campaignAdditionProgress = {},
  _isAddingToCampaigns = false,
}: ResourceListProps) {
  const [files, setFiles] = useState<ResourceFileWithCampaigns[]>([]);
  const [_campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Local progress map keyed by fileKey; 0..100
  const [progressByFileKey, setProgressByFileKey] = useState<
    Record<string, number>
  >({});
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const isFetchingRef = useRef<boolean>(false);
  const authReady = useAuthReady();

  const fetchResourceCampaigns = useCallback(
    async (files: ResourceFile[], campaigns: Campaign[] = []) => {
      try {
        const jwt = getStoredJwt();
        if (!jwt) {
          return;
        }

        const userCampaigns = campaigns;

        // Fetch each campaign's resources once
        const resourcesByCampaign = await Promise.all(
          userCampaigns.map(async (campaign) => {
            try {
              const {
                response: resourcesResponse,
                jwtExpired: resourcesJwtExpired,
              } = await authenticatedFetchWithExpiration(
                API_CONFIG.buildUrl(
                  API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCES(campaign.campaignId)
                ),
                { jwt }
              );
              if (resourcesJwtExpired) {
                throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
              }
              if (!resourcesResponse.ok) {
                throw new Error(
                  `Failed to fetch campaign resources: ${resourcesResponse.status}`
                );
              }
              const resourcesData = (await resourcesResponse.json()) as {
                resources: any[];
              };
              const resources = resourcesData.resources || [];
              const fileKeySet = new Set<string>(
                resources.map((r: any) => r.file_key)
              );
              return { campaign, fileKeySet };
            } catch (_e) {
              return { campaign, fileKeySet: new Set<string>() };
            }
          })
        );

        // Build mapping: file_key -> campaigns[]
        const fileKeyToCampaigns: Record<string, Campaign[]> = {};
        for (const { campaign, fileKeySet } of resourcesByCampaign) {
          for (const file of files) {
            if (fileKeySet.has(file.file_key)) {
              if (!fileKeyToCampaigns[file.file_key]) {
                fileKeyToCampaigns[file.file_key] = [];
              }
              fileKeyToCampaigns[file.file_key].push(campaign);
            }
          }
        }

        // Map files with campaigns and parse tags from JSON strings
        const filesWithCampaigns: ResourceFileWithCampaigns[] = files.map(
          (file) => ({
            ...file,
            campaigns: fileKeyToCampaigns[file.file_key] || [],
            tags:
              typeof file.tags === "string"
                ? JSON.parse(file.tags)
                : file.tags || [],
          })
        );

        setFiles(filesWithCampaigns);
        setCampaigns(userCampaigns);
      } catch (err) {
        console.error("Failed to fetch resource campaigns:", err);
        setError("Failed to fetch resource campaigns");
      }
    },
    []
  );

  const fetchResources = useCallback(async () => {
    try {
      if (isFetchingRef.current) {
        console.log(
          "[ResourceList] fetchResources already in progress, skipping"
        );
        return;
      }

      const jwt = getStoredJwt();
      if (!jwt) {
        setError(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
        return;
      }

      console.log(
        "[ResourceList] Starting fetchResources - CALL #",
        Date.now()
      );
      isFetchingRef.current = true;
      setLoading(true);
      setError(null);

      const { response: resourcesResponse, jwtExpired: resourcesJwtExpired } =
        await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.FILES),
          { jwt }
        );

      if (resourcesJwtExpired) {
        throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      }

      if (!resourcesResponse.ok) {
        throw new Error(
          `Failed to fetch resources: ${resourcesResponse.status}`
        );
      }

      const resourcesData = (await resourcesResponse.json()) as {
        files: ResourceFile[];
      };

      const files = resourcesData.files || [];
      console.log(
        `[ResourceList] Fetched ${files.length} files:`,
        files.map((f) => ({ filename: f.file_name, status: f.status }))
      );
      await fetchResourceCampaigns(files, campaigns);
    } catch (err) {
      console.error("Failed to fetch resources:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch resources"
      );
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [fetchResourceCampaigns, campaigns]);

  // Centralized refresh function for all file statuses
  const refreshAllFileStatuses = useCallback(async () => {
    try {
      const jwt = getStoredJwt();
      if (!jwt) {
        console.log("[ResourceList] No JWT available for refresh-all-statuses");
        return;
      }

      console.log(
        "[ResourceList] Refreshing all file statuses - CALL #",
        Date.now()
      );
      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.ENDPOINTS.AUTORAG.REFRESH_ALL_FILE_STATUSES,
        {
          method: "POST",
          jwt,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: AuthService.getUsernameFromStoredJwt(),
          }),
        }
      );

      if (jwtExpired) {
        console.warn(
          "[ResourceList] JWT expired while refreshing file statuses"
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
            `[ResourceList] Updated ${result.updatedCount} file statuses`
          );
          // Don't call fetchResources here to avoid circular dependency
          // The individual event handlers will update the local state directly
        }
      }
    } catch (error) {
      console.error("[ResourceList] Error refreshing file statuses:", error);
    }
  }, []);

  // Handle file status updates from SSE notifications
  const handleFileStatusUpdate = useCallback((event: CustomEvent) => {
    const { completeFileData, fileKey, fileName, status, fileSize } =
      event.detail;
    console.log("[ResourceList] Received file-status-updated event:", {
      completeFileData,
      fileKey,
      fileName,
      status,
      fileSize,
    });

    setFiles((prevFiles) => {
      // If we have complete file data, use it for in-place replacement
      if (completeFileData) {
        console.log(
          "[ResourceList] Updating file with complete data:",
          completeFileData
        );
        return prevFiles.map((file) => {
          if (file.file_key === completeFileData.file_key) {
            // Preserve campaigns data when replacing and parse tags from JSON string
            return {
              ...completeFileData,
              campaigns: file.campaigns || [],
              tags:
                typeof completeFileData.tags === "string"
                  ? JSON.parse(completeFileData.tags)
                  : completeFileData.tags || [],
            };
          }
          return file;
        });
      }

      // Fallback to individual field updates for backward compatibility
      console.log("[ResourceList] Updating file with individual fields");
      return prevFiles.map((file) => {
        if (file.file_key === fileKey) {
          return {
            ...file,
            status,
            ...(fileSize !== undefined && { file_size: fileSize }),
          };
        }
        return file;
      });
    });

    // Note: refreshAllFileStatuses is called from handleFileChange to avoid duplicate calls
  }, []);

  // Handle file changes from SSE notifications
  const handleFileChange = useCallback(
    (event: CustomEvent) => {
      const { completeFileData, fileName, fileSize } = event.detail;
      console.log("[ResourceList] Received file-changed event:", {
        completeFileData,
        fileName,
        fileSize,
      });

      // If we have complete file data, add the new file to the list in-place
      if (completeFileData) {
        console.log(
          "[ResourceList] Adding new file with complete data:",
          completeFileData
        );
        setFiles((prevFiles) => {
          // Check if file already exists (avoid duplicates)
          const exists = prevFiles.some(
            (f) => f.file_key === completeFileData.file_key
          );
          if (exists) {
            console.log(
              "[ResourceList] File already exists, skipping duplicate"
            );
            return prevFiles;
          }

          // Add new file to the beginning of the list with parsed tags
          const parsedFileData = {
            ...completeFileData,
            tags:
              typeof completeFileData.tags === "string"
                ? JSON.parse(completeFileData.tags)
                : completeFileData.tags || [],
          };
          return [parsedFileData, ...prevFiles];
        });
      } else {
        // Fallback to refresh if we don't have complete file data
        console.log("[ResourceList] No complete file data, refreshing list");
        fetchResources();
      }

      // Trigger refresh of all file statuses to ensure server state is current
      refreshAllFileStatuses();
    },
    [fetchResources, refreshAllFileStatuses]
  );

  const handleEditFile = (file: ResourceFileWithCampaigns) => {
    onEditFile?.(file);
  };

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

        // Call the retry endpoint
        const retryUrl = API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.AUTORAG.RETRY_FILE
        );
        const response = await authenticatedFetchWithExpiration(retryUrl, {
          method: "POST",
          jwt,
          body: JSON.stringify({ fileKey }),
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.response.ok) {
          throw new Error(`Retry failed: ${response.response.status}`);
        }

        const result = (await response.response.json()) as {
          queued: boolean;
          jobId?: string;
        };
        console.log(
          `[ResourceList] Retry initiated successfully for: ${fileName}`,
          result
        );

        // If queued, show immediate feedback
        if (result.queued) {
          console.log(`[ResourceList] File ${fileName} queued for retry`);
          // Keep progress at 0 to show "queued" state
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
    [fetchResources, setProgressByFileKey]
  );

  const toggleFileExpansion = (fileKey: string) => {
    const newExpandedFiles = new Set(expandedFiles);
    if (newExpandedFiles.has(fileKey)) {
      newExpandedFiles.delete(fileKey);
    } else {
      newExpandedFiles.add(fileKey);
    }
    setExpandedFiles(newExpandedFiles);
  };

  // Initial load - run when authentication becomes ready
  useEffect(() => {
    if (authReady) {
      fetchResources();
    }
  }, [authReady, fetchResources]);

  // Listen for file upload completed: update file status and finalize progress bar
  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.COMPLETED,
    (event) => {
      console.log(
        "[ResourceList] Received FILE_UPLOAD.COMPLETED event:",
        event
      );
      const key = event.fileKey;
      if (key) {
        // Update the file status from "uploading" to "processing"
        setFiles((prevFiles) => {
          return prevFiles.map((file) => {
            if (file.file_key === key) {
              console.log(
                "[ResourceList] Updating file status from uploading to processing:",
                file.file_name
              );
              return {
                ...file,
                status: "processing",
                updated_at: new Date().toISOString(),
              };
            }
            return file;
          });
        });

        // Snap to 100% then clear shortly after
        setProgressByFileKey((prev) => ({ ...prev, [key]: 100 }));
        setTimeout(() => {
          setProgressByFileKey((prev) => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
          });
        }, 1200);
      }
      console.log(
        "[ResourceList] Upload completed, file status updated to processing"
      );
    },
    []
  );

  // Upload progress listeners
  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.STARTED,
    (event) => {
      const key = event.fileKey;
      const filename = event.filename;
      const fileSize = event.fileSize;
      if (!key || !filename) return;

      console.log("[ResourceList] Received FILE_UPLOAD.STARTED event:", {
        key,
        filename,
        fileSize,
      });

      // Add the uploading file to the files list immediately
      setFiles((prevFiles) => {
        // Check if file already exists (avoid duplicates)
        const exists = prevFiles.some((f) => f.file_key === key);
        if (exists) {
          console.log("[ResourceList] File already exists, skipping duplicate");
          return prevFiles;
        }

        // Create a temporary file entry for the uploading file
        const uploadingFile: ResourceFileWithCampaigns = {
          id: key,
          file_key: key,
          file_name: filename,
          file_size: fileSize || 0, // Use file size from event if available
          status: "uploading",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          campaigns: [],
        };

        console.log(
          "[ResourceList] Adding uploading file to list:",
          uploadingFile
        );
        // Add new file to the beginning of the list
        return [uploadingFile, ...prevFiles];
      });

      setProgressByFileKey((prev) => ({ ...prev, [key]: 0 }));
    },
    []
  );

  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.PROGRESS,
    (event) => {
      const key = event.fileKey;
      if (!key) return;
      const pct = Math.max(0, Math.min(100, event.progress ?? 0));
      setProgressByFileKey((prev) => ({ ...prev, [key]: pct }));
    },
    []
  );

  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.FAILED,
    (event) => {
      const key = event.fileKey;
      if (!key) return;

      console.log("[ResourceList] Received FILE_UPLOAD.FAILED event:", event);

      // Update the file status to "failed"
      setFiles((prevFiles) => {
        return prevFiles.map((file) => {
          if (file.file_key === key) {
            console.log(
              "[ResourceList] Updating file status to failed:",
              file.file_name
            );
            return {
              ...file,
              status: "failed",
              updated_at: new Date().toISOString(),
            };
          }
          return file;
        });
      });

      setProgressByFileKey((prev) => ({ ...prev, [key]: 100 }));
      // Clear after a short delay to reflect failure via status badge
      setTimeout(() => {
        setProgressByFileKey((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      }, 1500);
    },
    []
  );

  // Indexing progress listeners
  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.STARTED,
    (event) => {
      const key = event.fileKey as string | undefined;
      if (!key) return;
      setProgressByFileKey((prev) => ({ ...prev, [key]: 0 }));
    },
    []
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.PROGRESS,
    (event) => {
      const key = event.fileKey as string | undefined;
      if (!key) return;
      const pct = Math.max(0, Math.min(100, event.progress ?? 0));
      setProgressByFileKey((prev) => ({ ...prev, [key]: pct }));
    },
    []
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.COMPLETED,
    (event) => {
      const key = event.fileKey as string | undefined;
      if (!key) return;
      setProgressByFileKey((prev) => ({ ...prev, [key]: 100 }));
      setTimeout(() => {
        setProgressByFileKey((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      }, 1500);
    },
    []
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.FAILED,
    (event) => {
      const key = event.fileKey as string | undefined;
      if (!key) return;
      setProgressByFileKey((prev) => ({ ...prev, [key]: 100 }));
      setTimeout(() => {
        setProgressByFileKey((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      }, 1500);
    },
    []
  );

  // Handle file status update events from SSE notifications
  useEffect(() => {
    // Listen for file status update events from the notification system
    window.addEventListener(
      "file-status-updated",
      handleFileStatusUpdate as EventListener
    );

    return () => {
      window.removeEventListener(
        "file-status-updated",
        handleFileStatusUpdate as EventListener
      );
    };
  }, [handleFileStatusUpdate]);

  // When files list updates, clear any lingering progress entries for files
  // that are no longer processing (e.g., completed or error)
  useEffect(() => {
    if (!files || files.length === 0) return;
    setProgressByFileKey((prev) => {
      const activeProcessingKeys = new Set(
        files
          .filter(
            (f) =>
              f.status === FileDAO.STATUS.UPLOADING ||
              f.status === FileDAO.STATUS.UPLOADED ||
              f.status === FileDAO.STATUS.SYNCING ||
              f.status === FileDAO.STATUS.PROCESSING ||
              f.status === FileDAO.STATUS.INDEXING
          )
          .map((f) => f.file_key)
      );
      // Remove entries for keys not actively processing
      let changed = false;
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (activeProcessingKeys.has(k)) {
          next[k] = v;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [files]);

  // Listen for file change events from SSE notifications
  useEffect(() => {
    // Listen for custom file change events
    window.addEventListener("file-changed", handleFileChange as EventListener);

    return () => {
      window.removeEventListener(
        "file-changed",
        handleFileChange as EventListener
      );
    };
  }, [handleFileChange]);

  // Listen for campaign changes to refresh campaign associations
  useEffect(() => {
    const handleCampaignChange = () => {
      console.log(
        "[ResourceList] Received campaign change event, refreshing campaign data"
      );
      // Re-fetch campaign associations for all files
      setFiles((prevFiles) => {
        fetchResourceCampaigns(prevFiles, campaigns);
        return prevFiles; // Return unchanged for now, fetchResourceCampaigns will update via setFiles
      });
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
  }, [fetchResourceCampaigns, campaigns]);

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
          onClick={fetchResources}
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
          <button
            key={file.file_key}
            type="button"
            className="relative p-2 border rounded-lg bg-white dark:bg-neutral-900 shadow-sm border-neutral-200 dark:border-neutral-800 overflow-hidden cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors duration-200 w-full text-left"
            onClick={() => toggleFileExpansion(file.file_key)}
          >
            {/* Progress fill (transparent overlay) */}
            <div
              className="absolute inset-y-0 left-0 pointer-events-none"
              style={{
                width: (() => {
                  // Check for campaign addition progress first
                  const campaignProgress =
                    campaignAdditionProgress[file.file_key];
                  if (typeof campaignProgress === "number") {
                    return `${campaignProgress}%`;
                  }

                  // Then check for file upload progress
                  const pct = progressByFileKey[file.file_key];
                  if (typeof pct === "number") return `${pct}%`;

                  // Progress based on status
                  switch (file.status) {
                    case FileDAO.STATUS.UPLOADING:
                      return "20%";
                    case FileDAO.STATUS.UPLOADED:
                      return "40%";
                    case FileDAO.STATUS.SYNCING:
                      return "60%";
                    case FileDAO.STATUS.PROCESSING:
                      return "80%";
                    case FileDAO.STATUS.INDEXING:
                      return "90%";
                    case FileDAO.STATUS.COMPLETED:
                      return "100%";
                    case FileDAO.STATUS.ERROR:
                      return "100%";
                    default:
                      return undefined;
                  }
                })(),
                transition: "width 300ms ease",
                background: (() => {
                  // Check for campaign addition progress first
                  const campaignProgress =
                    campaignAdditionProgress[file.file_key];
                  if (typeof campaignProgress === "number") {
                    return "rgba(147, 51, 234, 0.12)"; // Purple for campaign addition
                  }

                  // Then check for file status
                  return file.status === "error"
                    ? "rgba(239,68,68,0.15)"
                    : "rgba(147,197,253,0.12)";
                })(),
              }}
            />
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 mr-3 min-w-0">
                  <Tooltip
                    content={getDisplayName(file.file_name)}
                    id={file.file_key}
                  >
                    <h4
                      className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate cursor-help max-w-[200px]"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                    >
                      {getDisplayName(file.file_name)}
                    </h4>
                  </Tooltip>
                  {AuthService.getUsernameFromStoredJwt() && (
                    <FileStatusIndicator
                      tenant={AuthService.getUsernameFromStoredJwt()!}
                      initialStatus={file.status}
                      fileKey={file.file_key}
                      fileName={file.file_name}
                      fileSize={file.file_size}
                      onRetry={handleRetryFile}
                      className="flex-shrink-0"
                    />
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFileExpansion(file.file_key);
                  }}
                  type="button"
                  className="flex-shrink-0 p-1 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors duration-200"
                >
                  {expandedFiles.has(file.file_key) ? (
                    <CaretDownIcon size={16} className="text-purple-600" />
                  ) : (
                    <CaretRightIcon size={16} className="text-purple-600" />
                  )}
                </button>
              </div>

              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  expandedFiles.has(file.file_key)
                    ? "max-h-96 opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                <div className="mt-4 text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">
                      Uploaded:
                    </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {new Date(file.created_at)
                        .toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "2-digit",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })
                        .replace(",", "")
                        .replace(" PM", "p")
                        .replace(" AM", "a")}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">
                      Size:
                    </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {file.file_size
                        ? (file.file_size / 1024 / 1024).toFixed(2)
                        : "Unknown"}{" "}
                      MB
                    </span>
                  </div>
                </div>

                {file.description && (
                  <div className="mt-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {file.description}
                    </p>
                  </div>
                )}
                {file.tags && file.tags.length > 0 && (
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-1">
                      {file.tags.map((tag: string) => (
                        <span
                          key={tag}
                          className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {file.campaigns && file.campaigns.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Linked campaigns:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {file.campaigns.map((campaign) => (
                        <span
                          key={campaign.campaignId}
                          className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300 rounded"
                        >
                          {campaign.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  {(file.status === FileDAO.STATUS.UNINDEXED ||
                    file.status === FileDAO.STATUS.ERROR) && (
                    <Button
                      onClick={async () => {
                        try {
                          const jwt = getStoredJwt();
                          if (!jwt) return;

                          const { response } =
                            await authenticatedFetchWithExpiration(
                              API_CONFIG.buildUrl(
                                API_CONFIG.ENDPOINTS.RAG.TRIGGER_INDEXING
                              ),
                              {
                                method: "POST",
                                jwt,
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  fileKey: file.file_key,
                                }),
                              }
                            );

                          if (response.ok) {
                            // Refresh the file list to show updated status
                            await fetchResources();
                          }
                        } catch (error) {
                          console.error("Failed to retry indexing:", error);
                          setError(
                            "Failed to retry indexing. Please try again."
                          );
                        }
                      }}
                      variant="secondary"
                      size="sm"
                      className="w-full !text-orange-600 dark:!text-orange-400 hover:!text-orange-700 dark:hover:!text-orange-300 border-orange-200 dark:border-orange-700 hover:border-orange-300 dark:hover:border-orange-600"
                    >
                      Retry Indexing
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      onAddToCampaign?.(file);
                    }}
                    variant="secondary"
                    size="sm"
                    className="w-full !text-purple-600 dark:!text-purple-400 hover:!text-purple-700 dark:hover:!text-purple-300 border-purple-200 dark:border-purple-700 hover:border-purple-300 dark:hover:border-purple-600"
                    disabled={file.status !== FileDAO.STATUS.COMPLETED}
                  >
                    {file.status === FileDAO.STATUS.COMPLETED
                      ? "Add to campaign"
                      : "File Not Ready"}
                  </Button>
                  <Button
                    onClick={() => {
                      handleEditFile(file);
                    }}
                    variant="secondary"
                    size="sm"
                    className="w-full text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    Edit
                  </Button>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
