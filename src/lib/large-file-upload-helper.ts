import { API_CONFIG } from "@/shared-config";
import {
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "@/services/core/auth-service";
import type { FileUploadEvent } from "@/lib/event-bus";
import { EVENT_TYPES } from "@/lib/event-bus";

const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB

export interface LargeFileUploadResult {
  success: boolean;
  fileKey: string;
  error?: string;
}

/**
 * Upload a large file using multipart upload
 */
export async function uploadLargeFile(
  file: File,
  filename: string,
  _tenant: string,
  fileKey: string,
  sendEvent: (event: FileUploadEvent) => void
): Promise<LargeFileUploadResult> {
  try {
    const jwt = getStoredJwt();
    if (!jwt) {
      throw new Error("No authentication token found");
    }

    // Step 1: Start upload session
    sendEvent({
      type: EVENT_TYPES.FILE_UPLOAD.PROGRESS,
      fileKey,
      filename,
      fileSize: file.size,
      progress: 10,
      status: "uploading",
      source: "largeFileUpload",
    } as FileUploadEvent);

    const startResponse = await authenticatedFetchWithExpiration(
      API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.UPLOAD.START_LARGE),
      {
        method: "POST",
        jwt,
        body: JSON.stringify({
          filename,
          fileSize: file.size,
          contentType: file.type || "application/pdf",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!startResponse.response.ok) {
      const errorText = await startResponse.response.text();
      throw new Error(
        `Failed to start upload: ${startResponse.response.status} ${errorText}`
      );
    }

    const startData = (await startResponse.response.json()) as {
      success: boolean;
      sessionId: string;
      totalParts: number;
      partSize: number;
    };

    if (!startData.success || !startData.sessionId) {
      throw new Error("Failed to create upload session");
    }

    const { sessionId, totalParts, partSize } = startData;

    // Step 2: Upload parts
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, file.size);
      const chunk = file.slice(start, end);

      const partProgress = 10 + (partNumber / totalParts) * 80; // 10% to 90%

      sendEvent({
        type: EVENT_TYPES.FILE_UPLOAD.PROGRESS,
        fileKey,
        filename,
        fileSize: file.size,
        progress: Math.round(partProgress),
        status: "uploading",
        source: "largeFileUpload",
      } as FileUploadEvent);

      const partResponse = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.UPLOAD.UPLOAD_PART(
            sessionId,
            partNumber.toString()
          )
        ),
        {
          method: "POST",
          jwt,
          body: chunk,
          headers: {},
        }
      );

      if (!partResponse.response.ok) {
        const errorText = await partResponse.response.text();
        throw new Error(
          `Failed to upload part ${partNumber}: ${partResponse.response.status} ${errorText}`
        );
      }
    }

    // Step 3: Complete upload
    sendEvent({
      type: EVENT_TYPES.FILE_UPLOAD.PROGRESS,
      fileKey,
      filename,
      fileSize: file.size,
      progress: 90,
      status: "uploading",
      source: "largeFileUpload",
    } as FileUploadEvent);

    const completeResponse = await authenticatedFetchWithExpiration(
      API_CONFIG.buildUrl(
        API_CONFIG.ENDPOINTS.UPLOAD.COMPLETE_LARGE(sessionId)
      ),
      {
        method: "POST",
        jwt,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!completeResponse.response.ok) {
      const errorText = await completeResponse.response.text();
      throw new Error(
        `Failed to complete upload: ${completeResponse.response.status} ${errorText}`
      );
    }

    // Emit upload completed event
    sendEvent({
      type: EVENT_TYPES.FILE_UPLOAD.PROGRESS,
      fileKey,
      filename,
      fileSize: file.size,
      progress: 100,
      status: "uploading",
      source: "largeFileUpload",
    } as FileUploadEvent);

    sendEvent({
      type: EVENT_TYPES.FILE_UPLOAD.COMPLETED,
      fileKey,
      filename,
      fileSize: file.size,
      progress: 40,
      status: "uploaded",
      source: "largeFileUpload",
    } as FileUploadEvent);

    return {
      success: true,
      fileKey,
    };
  } catch (error) {
    return {
      success: false,
      fileKey,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if a file should use large file upload (multipart)
 */
export function shouldUseLargeFileUpload(fileSize: number): boolean {
  return fileSize >= LARGE_FILE_THRESHOLD;
}
