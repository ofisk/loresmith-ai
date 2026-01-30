import { useCallback, useEffect, useState } from "react";
import { AuthService } from "@/services/core/auth-service";
import {
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import type { FileUploadEvent } from "@/lib/event-bus";
import { EVENT_TYPES, useEventBus } from "@/lib/event-bus";
import { FileDAO } from "@/dao";
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
 * Helper to safely parse tags from JSON string or return as-is
 */
function parseTags(tags: string | string[] | undefined): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  if (typeof tags === "string") {
    try {
      const parsed = JSON.parse(tags);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Not valid JSON, treat as comma-separated string
      return tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    }
  }
  return [];
}

/**
 * Hook for handling file-related events (upload, indexing, status updates)
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
        return;
      }

      // Use bulk check file indexing endpoint to refresh file statuses
      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.RAG.BULK_CHECK_FILE_INDEXING),
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
        return;
      }

      if (response.ok) {
        await response.json();
        // File statuses updated successfully
      }
    } catch (error) {
      console.error("[ResourceList] Error refreshing file statuses:", error);
    }
  }, []);

  // Handle file status updates from SSE notifications
  const handleFileStatusUpdate = useCallback(
    (event: CustomEvent) => {
      const { completeFileData, fileKey, status, fileSize } = event.detail;

      // Skip processing if we don't have sufficient data
      if (completeFileData) {
        // Validate complete file data has required fields
        if (!completeFileData.file_key) {
          return;
        }
      } else if (!fileKey) {
        // Without complete file data, we need at least a fileKey to update
        return;
      }

      setFiles((prevFiles) => {
        // If we have complete file data, use it for in-place replacement
        if (completeFileData?.file_key) {
          const fileExists = prevFiles.some(
            (f) => f.file_key === completeFileData.file_key
          );
          if (!fileExists) {
            return prevFiles;
          }

          return prevFiles.map((file) => {
            if (file.file_key === completeFileData.file_key) {
              // Preserve campaigns data and status when replacing and parse tags from JSON string
              // If status is not in completeFileData, preserve the original file's status
              return {
                ...completeFileData,
                campaigns: file.campaigns || [],
                status: completeFileData.status || file.status || "completed", // Preserve original status
                tags: parseTags(completeFileData.tags),
              };
            }
            return file;
          });
        }

        // Fallback to individual field updates for backward compatibility
        const fileExists = prevFiles.some((f) => f.file_key === fileKey);
        if (!fileExists) {
          return prevFiles;
        }

        let hasChanges = false;
        const updatedFiles = prevFiles.map((file) => {
          if (file.file_key === fileKey) {
            // Check if status actually changed
            if (status && file.status !== status) {
              hasChanges = true;
            }
            // Check if fileSize changed
            if (fileSize !== undefined && file.file_size !== fileSize) {
              hasChanges = true;
            }

            return {
              ...file,
              ...(status && { status }),
              ...(fileSize !== undefined && { file_size: fileSize }),
            };
          }
          return file;
        });

        // Only return new array if something actually changed
        if (hasChanges) {
          return updatedFiles;
        }

        return prevFiles;
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
            tags: parseTags(completeFileData.tags),
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
              status: FileDAO.STATUS.ERROR, // Use standard ERROR status constant
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

  // Handle file status update events from SSE notifications
  useEffect(() => {
    window.addEventListener(
      APP_EVENT_TYPE.FILE_STATUS_UPDATED,
      handleFileStatusUpdate as EventListener
    );

    return () => {
      window.removeEventListener(
        APP_EVENT_TYPE.FILE_STATUS_UPDATED,
        handleFileStatusUpdate as EventListener
      );
    };
  }, [handleFileStatusUpdate]);

  // Listen for file change events from SSE notifications
  useEffect(() => {
    window.addEventListener(
      APP_EVENT_TYPE.FILE_CHANGED,
      handleFileChange as EventListener
    );

    return () => {
      window.removeEventListener(
        APP_EVENT_TYPE.FILE_CHANGED,
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
