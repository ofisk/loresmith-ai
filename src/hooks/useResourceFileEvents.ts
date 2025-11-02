import { useCallback, useEffect, useState } from "react";
import { AuthService } from "@/services/core/auth-service";
import {
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";
import type { AutoRAGEvent, FileUploadEvent } from "@/lib/event-bus";
import { EVENT_TYPES, useEventBus } from "@/lib/event-bus";
import { FileDAO } from "@/dao/file-dao";
import type { ResourceFileWithCampaigns } from "./useResourceFiles";

interface UseResourceFileEventsOptions {
  files: ResourceFileWithCampaigns[];
  setFiles: React.Dispatch<React.SetStateAction<ResourceFileWithCampaigns[]>>;
  setProgressByFileKey: React.Dispatch<
    React.SetStateAction<Record<string, number>>
  >;
  fetchResources: () => Promise<void>;
}

interface UseResourceFileEventsReturn {
  progressByFileKey: Record<string, number>;
  refreshAllFileStatuses: () => Promise<void>;
}

/**
 * Hook for handling file-related events (upload, AutoRAG, status updates)
 */
export function useResourceFileEvents(
  options: UseResourceFileEventsOptions
): UseResourceFileEventsReturn {
  const { files, setFiles, setProgressByFileKey, fetchResources } = options;
  const [progressByFileKey, setProgressByFileKeyState] = useState<
    Record<string, number>
  >({});

  // Update the internal state and call the prop setter
  const updateProgress = useCallback(
    (fileKey: string, progress: number) => {
      setProgressByFileKeyState((prev) => ({ ...prev, [fileKey]: progress }));
      setProgressByFileKey((prev) => ({ ...prev, [fileKey]: progress }));
    },
    [setProgressByFileKey]
  );

  const clearProgress = useCallback(
    (fileKey: string) => {
      setProgressByFileKeyState((prev) => {
        const copy = { ...prev };
        delete copy[fileKey];
        return copy;
      });
      setProgressByFileKey((prev) => {
        const copy = { ...prev };
        delete copy[fileKey];
        return copy;
      });
    },
    [setProgressByFileKey]
  );

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
        }
      }
    } catch (error) {
      console.error("[ResourceList] Error refreshing file statuses:", error);
    }
  }, []);

  // Handle file status updates from SSE notifications
  const handleFileStatusUpdate = useCallback(
    (event: CustomEvent) => {
      const { completeFileData, fileKey, status, fileSize } = event.detail;
      console.log("[ResourceList] Received file-status-updated event:", {
        completeFileData,
        fileKey,
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
    },
    [setFiles]
  );

  // Handle file changes from SSE notifications
  const handleFileChange = useCallback(
    (event: CustomEvent) => {
      const { completeFileData } = event.detail;
      console.log("[ResourceList] Received file-changed event:", {
        completeFileData,
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
    [fetchResources, refreshAllFileStatuses, setFiles]
  );

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
        updateProgress(key, 100);
        setTimeout(() => {
          clearProgress(key);
        }, 1200);
      }
      console.log(
        "[ResourceList] Upload completed, file status updated to processing"
      );
    },
    [setFiles, updateProgress, clearProgress]
  );

  // Upload started listener
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
          file_size: fileSize || 0,
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

      updateProgress(key, 0);
    },
    [setFiles, updateProgress]
  );

  // Upload progress listener
  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.PROGRESS,
    (event) => {
      const key = event.fileKey;
      if (!key) return;
      const pct = Math.max(0, Math.min(100, event.progress ?? 0));
      updateProgress(key, pct);
    },
    [updateProgress]
  );

  // Upload failed listener
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

      updateProgress(key, 100);
      // Clear after a short delay to reflect failure via status badge
      setTimeout(() => {
        clearProgress(key);
      }, 1500);
    },
    [setFiles, updateProgress, clearProgress]
  );

  // Indexing progress listeners
  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.STARTED,
    (event) => {
      const key = event.fileKey as string | undefined;
      if (!key) return;
      updateProgress(key, 0);
    },
    [updateProgress]
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.PROGRESS,
    (event) => {
      const key = event.fileKey as string | undefined;
      if (!key) return;
      const pct = Math.max(0, Math.min(100, event.progress ?? 0));
      updateProgress(key, pct);
    },
    [updateProgress]
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.COMPLETED,
    (event) => {
      const key = event.fileKey as string | undefined;
      if (!key) return;
      updateProgress(key, 100);
      setTimeout(() => {
        clearProgress(key);
      }, 1500);
    },
    [updateProgress, clearProgress]
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.FAILED,
    (event) => {
      const key = event.fileKey as string | undefined;
      if (!key) return;
      updateProgress(key, 100);
      setTimeout(() => {
        clearProgress(key);
      }, 1500);
    },
    [updateProgress, clearProgress]
  );

  // Handle file status update events from SSE notifications
  useEffect(() => {
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

  // Listen for file change events from SSE notifications
  useEffect(() => {
    window.addEventListener("file-changed", handleFileChange as EventListener);

    return () => {
      window.removeEventListener(
        "file-changed",
        handleFileChange as EventListener
      );
    };
  }, [handleFileChange]);

  // When files list updates, clear any lingering progress entries for files
  // that are no longer processing (e.g., completed or error)
  useEffect(() => {
    if (!files || files.length === 0) return;
    setProgressByFileKeyState((prev) => {
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

  return {
    progressByFileKey,
    refreshAllFileStatuses,
  };
}
