import { useCallback, useState } from "react";
import type { FileUploadEvent } from "@/lib/event-bus";
import { EVENT_TYPES, useEvent } from "@/lib/event-bus";
import {
  AuthService,
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";
import { buildStagingFileKey } from "@/lib/file-keys";

interface UseFileUploadProps {
  onUploadSuccess?: (filename: string, fileKey: string) => void;
  onUploadStart?: () => void;
}

export function useFileUpload({
  onUploadSuccess,
  onUploadStart,
}: UseFileUploadProps = {}) {
  const [currentUploadId, setCurrentUploadId] = useState<string | null>(null);
  const [uploadedFileInfo, setUploadedFileInfo] = useState<{
    filename: string;
    fileKey: string;
  } | null>(null);

  const send = useEvent();

  const handleUpload = useCallback(
    async (
      file: File,
      filename: string,
      _description: string,
      _tags: string[]
    ) => {
      // Early authentication check to prevent unnecessary logging when unauthenticated
      const jwt = getStoredJwt();
      if (!jwt) {
        throw new Error("No authentication token found");
      }

      const tenant = AuthService.getUsernameFromStoredJwt();
      if (!tenant) {
        throw new Error("No username/tenant available for upload");
      }

      console.log("[useFileUpload] handleUpload called with:", {
        filename,
        fileSize: file.size,
        fileType: file.type,
      });

      const uploadId = `${filename}`;
      setCurrentUploadId(uploadId);

      // Emit upload started event
      const fileKey = buildStagingFileKey(tenant, filename);

      console.log("[useFileUpload] Built fileKey:", fileKey);

      send({
        type: EVENT_TYPES.FILE_UPLOAD.STARTED,
        fileKey,
        filename,
        fileSize: file.size,
        source: "useFileUpload",
      } as FileUploadEvent);

      // Call upload start callback to close modal
      onUploadStart?.();

      try {
        console.log("[useFileUpload] Starting upload process...");
        console.log("[useFileUpload] JWT token: present");
        console.log("[useFileUpload] Tenant:", tenant);

        // Step 1: Upload file directly to storage
        send({
          type: EVENT_TYPES.FILE_UPLOAD.PROGRESS,
          fileKey,
          filename,
          fileSize: file.size,
          progress: 20,
          status: "uploading",
          source: "useFileUpload",
        } as FileUploadEvent);

        const uploadUrl = API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.UPLOAD.DIRECT(tenant, filename)
        );

        console.log("[useFileUpload] Upload request body:", {
          tenant,
          originalName: filename,
          contentType: file.type || "application/pdf",
          fileSize: file.size,
          uploadUrl,
          jwt: "present",
        });

        // Direct upload to R2 storage
        console.log("[useFileUpload] Starting upload request to:", uploadUrl);
        const uploadResponse = await authenticatedFetchWithExpiration(
          uploadUrl,
          {
            method: "PUT",
            jwt,
            body: file,
            headers: {
              "Content-Type": file.type || "application/pdf",
            },
          }
        );

        console.log("[useFileUpload] Upload response:", {
          status: uploadResponse.response.status,
          ok: uploadResponse.response.ok,
          jwtExpired: uploadResponse.jwtExpired,
        });

        if (uploadResponse.jwtExpired) {
          throw new Error("Authentication expired. Please log in again.");
        }

        if (!uploadResponse.response.ok) {
          const errorText = await uploadResponse.response.text();
          throw new Error(
            `Upload failed: ${uploadResponse.response.status} ${errorText}`
          );
        }

        // Emit upload completed event (file uploaded to R2, ready for indexing)
        console.log("[useFileUpload] Emitting file upload completed event:", {
          type: EVENT_TYPES.FILE_UPLOAD.COMPLETED,
          fileKey,
          filename,
          progress: 40,
          status: "uploaded",
          source: "useFileUpload",
        });
        send({
          type: EVENT_TYPES.FILE_UPLOAD.COMPLETED,
          fileKey,
          filename,
          fileSize: file.size,
          progress: 40,
          status: "uploaded",
          source: "useFileUpload",
        } as FileUploadEvent);

        // Success state - file processing will be handled by the queue consumer; progress will arrive via SSE
        setUploadedFileInfo({
          filename: filename,
          fileKey: fileKey,
        });

        // Call success callback
        onUploadSuccess?.(filename, fileKey);
      } catch (error) {
        console.error("[useFileUpload] Upload error:", error);
        console.error("[useFileUpload] Error details:", {
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        });

        // Emit upload failed event
        send({
          type: EVENT_TYPES.FILE_UPLOAD.FAILED,
          fileKey: buildStagingFileKey(
            AuthService.getUsernameFromStoredJwt() || "",
            filename
          ),
          filename,
          fileSize: file.size,
          error: error instanceof Error ? error.message : "Unknown error",
          source: "useFileUpload",
        } as FileUploadEvent);
      }
    },
    [send, onUploadSuccess, onUploadStart]
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
