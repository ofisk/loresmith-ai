import { useCallback, useState } from "react";
import { useEventEmitter, EVENT_TYPES } from "../lib/event-bus";
import type { FileUploadEvent } from "../lib/event-bus";
import { buildAutoRAGFileKey } from "../utils/file-keys";
import {
  AuthService,
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "../services/auth-service";
import { AutoRAGService } from "../services/autorag-service";
import { API_CONFIG, AUTORAG_CONFIG } from "../shared";
import { useAutoRAGPolling } from "./useAutoRAGPolling";

interface UseFileUploadProps {
  onSendNotification?: (message: string) => void;
  onUploadSuccess?: (filename: string, fileKey: string) => void;
}

export function useFileUpload({
  onSendNotification,
  onUploadSuccess,
}: UseFileUploadProps = {}) {
  const [currentUploadId, setCurrentUploadId] = useState<string | null>(null);
  const [uploadedFileInfo, setUploadedFileInfo] = useState<{
    filename: string;
    fileKey: string;
  } | null>(null);

  const emit = useEventEmitter();
  const { startPolling } = useAutoRAGPolling();

  const handleUpload = useCallback(
    async (
      file: File,
      filename: string,
      _description: string,
      _tags: string[]
    ) => {
      const uploadId = `${filename}`;
      setCurrentUploadId(uploadId);

      // Emit upload started event
      emit({
        type: EVENT_TYPES.FILE_UPLOAD.STARTED,
        fileKey: buildAutoRAGFileKey(
          AuthService.getUsernameFromStoredJwt() || "",
          filename
        ),
        filename,
        source: "useFileUpload",
      } as FileUploadEvent);

      try {
        const jwt = getStoredJwt();
        if (!jwt) {
          throw new Error("No authentication token found");
        }

        // Extract username from JWT
        const tenant = AuthService.getUsernameFromStoredJwt();
        if (!tenant) {
          throw new Error("No username/tenant available for upload");
        }

        const fileKey = buildAutoRAGFileKey(tenant, filename);

        // Step 1: Upload file directly to storage
        emit({
          type: EVENT_TYPES.FILE_UPLOAD.PROGRESS,
          fileKey,
          filename,
          progress: 25,
          source: "useFileUpload",
        } as FileUploadEvent);

        console.log("[useFileUpload] Upload request body:", {
          tenant,
          originalName: filename,
          contentType: file.type || "application/pdf",
          fileSize: file.size,
        });

        // Direct upload to R2 storage
        const uploadResponse = await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.UPLOAD.DIRECT(tenant, filename)
          ),
          {
            method: "PUT",
            jwt,
            body: file,
            headers: {
              "Content-Type": file.type || "application/pdf",
            },
          }
        );

        if (uploadResponse.jwtExpired) {
          throw new Error("Authentication expired. Please log in again.");
        }

        if (!uploadResponse.response.ok) {
          const errorText = await uploadResponse.response.text();
          throw new Error(
            `Upload failed: ${uploadResponse.response.status} ${errorText}`
          );
        }

        // Emit upload completed event
        emit({
          type: EVENT_TYPES.FILE_UPLOAD.COMPLETED,
          fileKey,
          filename,
          progress: 100,
          source: "useFileUpload",
        } as FileUploadEvent);

        // Success state - trigger AutoRAG sync and start polling
        setUploadedFileInfo({
          filename: filename,
          fileKey: fileKey,
        });

        // Send notification about successful upload
        if (onSendNotification) {
          onSendNotification(
            `Your recent document "${filename}" has been indexed and is ready to be added to a campaign.`
          );
        }

        // Call success callback
        onUploadSuccess?.(filename, fileKey);

        // Trigger AutoRAG sync and start polling for job status
        try {
          // Add a small delay to avoid hitting rate limits
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const ragId = AUTORAG_CONFIG.LIBRARY_RAG_ID;
          const jobId = await AutoRAGService.triggerSync(ragId);

          console.log("[useFileUpload] AutoRAG sync triggered, job_id:", jobId);

          // Start polling for job status with file key
          startPolling(ragId, jobId, fileKey);

          // Add a cooldown period to prevent hitting rate limits
          setTimeout(() => {
            // 5 second cooldown to prevent hitting rate limits
          }, 5000);
        } catch (syncError) {
          console.error("[useFileUpload] AutoRAG sync error:", syncError);
        }
      } catch (error) {
        console.error("[useFileUpload] Upload error:", error);

        // Emit upload failed event
        emit({
          type: EVENT_TYPES.FILE_UPLOAD.FAILED,
          fileKey: buildAutoRAGFileKey(
            AuthService.getUsernameFromStoredJwt() || "",
            filename
          ),
          filename,
          error: error instanceof Error ? error.message : "Unknown error",
          source: "useFileUpload",
        } as FileUploadEvent);
      }
    },
    [emit, startPolling, onSendNotification, onUploadSuccess]
  );

  const clearUploadedFileInfo = useCallback(() => {
    setUploadedFileInfo(null);
  }, []);

  return {
    currentUploadId,
    uploadedFileInfo,
    handleUpload,
    clearUploadedFileInfo,
  };
}
