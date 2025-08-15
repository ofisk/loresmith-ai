// File upload component for the new multipart upload system
// Supports large files, concurrent uploads, and progress tracking

import type React from "react";
import { useCallback, useState, useId } from "react";
import { API_CONFIG } from "../../shared";
import { JWT_STORAGE_KEY } from "../../constants";

interface FileUploadProps {
  onUploadComplete?: (fileKey: string, metadata: any) => void;
  onUploadError?: (error: string) => void;
  maxFileSize?: number; // in bytes
  allowedTypes?: string[];
  multiple?: boolean;
}

interface UploadProgress {
  sessionId: string;
  filename: string;
  uploadedParts: number;
  totalParts: number;
  percentage: number;
  status: "pending" | "uploading" | "completed" | "failed" | "processing";
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onUploadComplete,
  onUploadError,
  maxFileSize = 100 * 1024 * 1024, // 100MB default
  allowedTypes = ["application/pdf", "text/plain", "application/json"],
  multiple = false,
}) => {
  const fileUploadId = useId();
  const [uploads, setUploads] = useState<Map<string, UploadProgress>>(
    new Map()
  );
  const [isUploading, setIsUploading] = useState(false);

  const validateFile = useCallback(
    (file: File): string | null => {
      if (file.size > maxFileSize) {
        return `File size exceeds ${Math.round(maxFileSize / 1024 / 1024)}MB limit`;
      }

      if (!allowedTypes.includes(file.type)) {
        return `File type ${file.type} is not allowed`;
      }

      return null;
    },
    [maxFileSize, allowedTypes]
  );

  const startUpload = useCallback(async (file: File): Promise<string> => {
    const response = await fetch(`${API_CONFIG.getApiBaseUrl()}/upload/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem(JWT_STORAGE_KEY)}`,
      },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        fileSize: file.size,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to start upload");
    }

    const data = await response.json();
    return (data as any).sessionId;
  }, []);

  const uploadPart = useCallback(
    async (
      sessionId: string,
      partNumber: number,
      chunk: Blob
    ): Promise<{ etag: string; size: number }> => {
      const formData = new FormData();
      formData.append("sessionId", sessionId);
      formData.append("partNumber", partNumber.toString());
      formData.append("file", chunk);

      const response = await fetch(
        `${API_CONFIG.getApiBaseUrl()}/upload/part`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem(JWT_STORAGE_KEY)}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error("Failed to upload part");
      }

      const data = await response.json();
      return { etag: (data as any).etag, size: (data as any).size };
    },
    []
  );

  const completeUpload = useCallback(
    async (sessionId: string): Promise<{ fileKey: string; metadata: any }> => {
      const response = await fetch(
        `${API_CONFIG.getApiBaseUrl()}/upload/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem(JWT_STORAGE_KEY)}`,
          },
          body: JSON.stringify({ sessionId }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to complete upload");
      }

      const data = await response.json();
      return {
        fileKey: (data as any).fileKey,
        metadata: (data as any).metadata,
      };
    },
    []
  );

  const uploadFile = useCallback(
    async (file: File) => {
      const error = validateFile(file);
      if (error) {
        onUploadError?.(error);
        return;
      }

      let sessionId: string;
      try {
        setIsUploading(true);

        // Start upload session
        sessionId = await startUpload(file);

        // Initialize progress tracking
        const progress: UploadProgress = {
          sessionId,
          filename: file.name,
          uploadedParts: 0,
          totalParts: 0,
          percentage: 0,
          status: "pending",
        };

        setUploads((prev) => new Map(prev).set(sessionId, progress));

        // Get session details for total parts
        const sessionResponse = await fetch(
          `${API_CONFIG.getApiBaseUrl()}/upload/progress/${sessionId}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem(JWT_STORAGE_KEY)}`,
            },
          }
        );

        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          progress.totalParts = (sessionData as any).progress.totalParts;
          setUploads((prev) => new Map(prev).set(sessionId, { ...progress }));
        }

        // Upload file in chunks
        const chunkSize = 5 * 1024 * 1024; // 5MB chunks
        const totalParts = Math.ceil(file.size / chunkSize);
        const uploadPromises: Promise<void>[] = [];

        for (let i = 0; i < totalParts; i++) {
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, file.size);
          const chunk = file.slice(start, end);
          const partNumber = i + 1;

          const uploadPromise = uploadPart(sessionId, partNumber, chunk).then(
            () => {
              // Update progress
              setUploads((prev) => {
                const current = prev.get(sessionId);
                if (current) {
                  const updated = {
                    ...current,
                    uploadedParts: current.uploadedParts + 1,
                    percentage: Math.round(
                      ((current.uploadedParts + 1) / current.totalParts) * 100
                    ),
                    status: "uploading" as const,
                  };
                  return new Map(prev).set(sessionId, updated);
                }
                return prev;
              });
            }
          );

          uploadPromises.push(uploadPromise);
        }

        // Wait for all parts to upload
        await Promise.all(uploadPromises);

        // Complete upload
        const { fileKey, metadata } = await completeUpload(sessionId);

        // Update final status
        setUploads((prev) => {
          const current = prev.get(sessionId);
          if (current) {
            const updated = { ...current, status: "completed" as const };
            return new Map(prev).set(sessionId, updated);
          }
          return prev;
        });

        onUploadComplete?.(fileKey, metadata);

        // Clean up session after a delay
        setTimeout(async () => {
          try {
            await fetch(
              `${API_CONFIG.getApiBaseUrl()}/upload/session/${sessionId}`,
              {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${localStorage.getItem(JWT_STORAGE_KEY)}`,
                },
              }
            );
          } catch (error) {
            console.error("Failed to clean up upload session:", error);
          }
        }, 5000);
      } catch (error) {
        console.error("Upload failed:", error);
        setUploads((prev) => {
          const current = prev.get(sessionId);
          if (current) {
            const updated = { ...current, status: "failed" as const };
            return new Map(prev).set(sessionId, updated);
          }
          return prev;
        });
        onUploadError?.(
          error instanceof Error ? error.message : "Upload failed"
        );
      } finally {
        setIsUploading(false);
      }
    },
    [
      validateFile,
      startUpload,
      uploadPart,
      completeUpload,
      onUploadComplete,
      onUploadError,
    ]
  );

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      if (multiple) {
        files.forEach(uploadFile);
      } else if (files.length > 0) {
        uploadFile(files[0]);
      }
    },
    [uploadFile, multiple]
  );

  const getStatusColor = (status: UploadProgress["status"]) => {
    switch (status) {
      case "pending":
        return "text-gray-500";
      case "uploading":
        return "text-blue-500";
      case "completed":
        return "text-green-500";
      case "failed":
        return "text-red-500";
      case "processing":
        return "text-yellow-500";
      default:
        return "text-gray-500";
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <input
          type="file"
          onChange={handleFileSelect}
          multiple={multiple}
          accept={allowedTypes.join(",")}
          className="hidden"
          id={fileUploadId}
          disabled={isUploading}
        />
        <label
          htmlFor={fileUploadId}
          className={`cursor-pointer block ${
            isUploading ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <div className="text-4xl mb-4">📁</div>
          <div className="text-lg font-medium mb-2">
            {isUploading
              ? "Uploading..."
              : "Drop files here or click to upload"}
          </div>
          <div className="text-sm text-gray-500">
            Max file size: {Math.round(maxFileSize / 1024 / 1024)}MB
          </div>
        </label>
      </div>

      {/* Upload Progress */}
      {uploads.size > 0 && (
        <div className="mt-6 space-y-4">
          <h3 className="text-lg font-medium">Upload Progress</h3>
          {Array.from(uploads.values()).map((upload) => (
            <div key={upload.sessionId} className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium truncate">{upload.filename}</span>
                <span className={`text-sm ${getStatusColor(upload.status)}`}>
                  {upload.status}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${upload.percentage}%` }}
                />
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {upload.uploadedParts} / {upload.totalParts} parts (
                {upload.percentage}%)
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
