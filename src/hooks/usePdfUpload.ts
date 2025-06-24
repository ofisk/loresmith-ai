import { useState } from "react";

interface UploadResult {
  success: boolean;
  fileKey?: string;
  error?: string;
}

interface UsePdfUploadOptions {
  sessionId: string;
  onSuccess?: (result: UploadResult) => void;
  onError?: (error: string) => void;
}

export const usePdfUpload = ({ sessionId, onSuccess, onError }: UsePdfUploadOptions) => {
  const [loading, setLoading] = useState(false);

  const uploadPdf = async (file: File, description: string, tags: string[]) => {
    setLoading(true);
    
    try {
      // Step 1: Get upload URL
      const uploadUrlResponse = await fetch("/pdf/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          fileName: file.name,
        }),
      });

      if (!uploadUrlResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadUrl, fileKey } = await uploadUrlResponse.json() as { uploadUrl: string; fileKey: string };

      // Step 2: Upload file to R2
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/pdf",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file");
      }

      // Step 3: Update file metadata with description and tags
      const metadataResponse = await fetch("/pdf/update-metadata", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          fileKey,
          metadata: {
            description,
            tags,
            originalName: file.name,
            fileSize: file.size,
            uploadedAt: new Date().toISOString(),
          },
        }),
      });

      if (!metadataResponse.ok) {
        console.warn("Failed to update metadata, but file was uploaded");
      }

      // Step 4: Trigger ingestion
      const ingestResponse = await fetch("/pdf/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          fileKey,
        }),
      });

      if (!ingestResponse.ok) {
        console.warn("Failed to trigger ingestion, but file was uploaded");
      }

      const result: UploadResult = {
        success: true,
        fileKey,
      };

      onSuccess?.(result);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Upload failed";
      onError?.(errorMessage);
      
      const result: UploadResult = {
        success: false,
        error: errorMessage,
      };
      
      return result;
    } finally {
      setLoading(false);
    }
  };

  return {
    uploadPdf,
    loading,
  };
}; 