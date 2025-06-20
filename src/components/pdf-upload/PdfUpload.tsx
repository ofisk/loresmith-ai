import React, { useState, useRef } from "react";
import { Button } from "../button/Button";
import { Paperclip, X, CheckCircle, XCircle } from "@phosphor-icons/react";
import { PDF_CONFIG } from "../../shared";
import { useAgentContext } from "../../contexts/AgentContext";

interface PdfUploadProps {
  onUploadStart?: (files: File[]) => void;
  onUploadComplete?: (results: any[]) => void;
  onUploadError?: (error: string) => void;
  onFileUploadComplete?: (file: File, result: any) => void;
  onFileUploadError?: (file: File, error: string) => void;
  disabled?: boolean;
  multiple?: boolean;
  maxFiles?: number;
  adminSecret?: string;
}

interface FileUploadState {
  file: File;
  status:
    | "pending"
    | "generating-url"
    | "uploading"
    | "confirming"
    | "completed"
    | "error";
  progress: number;
  uploadUrl: string | null;
  uploadId: string | null;
  error: string | null;
  result: any;
}

export const PdfUpload: React.FC<PdfUploadProps> = ({
  onUploadStart,
  onUploadComplete,
  onUploadError,
  onFileUploadComplete,
  onFileUploadError,
  disabled = false,
  multiple = true,
  maxFiles = PDF_CONFIG.MAX_FILES_DEFAULT, //limiting here to 10 files to avoid unnecessary cost during development -- can be removed later
  adminSecret, //admin secret to avoid random uploads from the internet -- can be removed later or moved to smarter auth
}) => {
  const [fileStates, setFileStates] = useState<FileUploadState[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) return;

    // Check max files limit
    const totalFiles = fileStates.length + selectedFiles.length;
    if (totalFiles > maxFiles) {
      onUploadError?.(
        `Maximum ${maxFiles} files allowed. You selected ${selectedFiles.length} files but already have ${fileStates.length} files.`
      );
      return;
    }

    // Add all selected files - validation will happen server-side
    const newFileStates: FileUploadState[] = selectedFiles.map((file) => ({
      file,
      status: "pending",
      progress: 0,
      uploadUrl: null,
      uploadId: null,
      error: null,
      result: null,
    }));

    setFileStates((prev) => [...prev, ...newFileStates]);
    onUploadStart?.(selectedFiles);
  };

  const updateFileState = (
    fileIndex: number,
    updates: Partial<FileUploadState>
  ) => {
    setFileStates((prev) =>
      prev.map((state, index) =>
        index === fileIndex ? { ...state, ...updates } : state
      )
    );
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data:application/pdf;base64, prefix
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const uploadSingleFile = async (fileIndex: number) => {
    const fileState = fileStates[fileIndex];
    if (!fileState || fileState.status !== "pending") return;

    if (!adminSecret) {
      const errorMessage = "Admin secret required for PDF upload";
      updateFileState(fileIndex, {
        status: "error",
        error: errorMessage,
      });
      onFileUploadError?.(fileState.file, errorMessage);
      return;
    }

    // Choose upload method based on file size
    const fileSizeMB = fileState.file.size / 1024 / 1024;
    const usePresignedUrl = fileSizeMB > PDF_CONFIG.PRESIGNED_URL_THRESHOLD_MB;

    if (usePresignedUrl) {
      return await uploadViaPresignedUrl(fileIndex);
    } else {
      return await uploadViaBase64(fileIndex);
    }
  };

  const uploadViaBase64 = async (fileIndex: number) => {
    const fileState = fileStates[fileIndex];
    const { invokeTool } = useAgentContext();

    try {
      // Step 1: Convert file to base64
      updateFileState(fileIndex, { status: "generating-url", progress: 10 });
      const base64Data = await convertFileToBase64(fileState.file);

      // Step 2: Upload using the uploadPdfFile tool
      updateFileState(fileIndex, { status: "uploading", progress: 50 });

      const result = await invokeTool("uploadPdfFile", {
        filename: fileState.file.name,
        fileData: base64Data,
        adminSecret: adminSecret,
      });

      updateFileState(fileIndex, {
        status: "completed",
        result: result || "Upload completed",
        progress: 100,
      });

      onFileUploadComplete?.(fileState.file, result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Upload failed";
      updateFileState(fileIndex, {
        status: "error",
        error: errorMessage,
      });
      onFileUploadError?.(fileState.file, errorMessage);
    }
  };

  const uploadViaPresignedUrl = async (fileIndex: number) => {
    const fileState = fileStates[fileIndex];
    const { invokeTool } = useAgentContext();

    try {
      // Step 1: Generate presigned URL
      updateFileState(fileIndex, { status: "generating-url" });
      
      const urlResult = await invokeTool("generatePdfUploadUrl", {
        filename: fileState.file.name,
        fileSize: fileState.file.size,
        adminSecret: adminSecret,
      });

      const uploadUrl = urlResult.uploadUrl;
      const uploadId = urlResult.uploadId;

      if (!uploadUrl || !uploadId) {
        throw new Error("Invalid upload URL response");
      }

      updateFileState(fileIndex, {
        status: "uploading",
        uploadUrl,
        uploadId,
        progress: 0,
      });

      // Step 2: Upload directly to R2
      await uploadToR2(fileState.file, uploadUrl, (progress) => {
        updateFileState(fileIndex, { progress });
      });

      // Step 3: Confirm upload
      updateFileState(fileIndex, { status: "confirming" });
      
      const result = await invokeTool("confirmPdfUpload", {
        uploadId: uploadId,
      });

      updateFileState(fileIndex, {
        status: "completed",
        result: result || "Upload completed",
        progress: 100,
      });

      onFileUploadComplete?.(fileState.file, result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Upload failed";
      updateFileState(fileIndex, {
        status: "error",
        error: errorMessage,
      });
      onFileUploadError?.(fileState.file, errorMessage);
    }
  };

  const uploadToR2 = async (
    file: File,
    uploadUrl: string,
    onProgress: (progress: number) => void
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Upload failed"));
      });

      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", "application/pdf");
      xhr.send(file);
    });
  };

  const handleUploadAll = async () => {
    const pendingFiles = fileStates
      .map((state, index) => ({ state, index }))
      .filter(({ state }) => state.status === "pending");

    if (pendingFiles.length === 0) return;

    setIsProcessing(true);

    try {
      // Upload files in parallel (you could also do sequential by using a for loop)
      await Promise.all(
        pendingFiles.map(({ index }) => uploadSingleFile(index))
      );

      const completedResults = fileStates
        .filter((state) => state.status === "completed")
        .map((state) => state.result);

      onUploadComplete?.(completedResults);
    } catch (error) {
      onUploadError?.(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveFile = (fileIndex: number) => {
    setFileStates((prev) => prev.filter((_, index) => index !== fileIndex));

    // Reset file input if no files left
    if (fileStates.length === 1 && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClearAll = () => {
    setFileStates([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getStatusIcon = (status: FileUploadState["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle size={16} className="text-green-600" />;
      case "error":
        return <XCircle size={16} className="text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusText = (state: FileUploadState) => {
    switch (state.status) {
      case "pending":
        return "Ready to upload";
      case "generating-url":
        return "Preparing...";
      case "uploading":
        return `Uploading ${state.progress}%`;
      case "confirming":
        return "Confirming...";
      case "completed":
        return "Completed";
      case "error":
        return state.error || "Error";
      default:
        return "";
    }
  };

  const pendingCount = fileStates.filter(
    (state) => state.status === "pending"
  ).length;
  const completedCount = fileStates.filter(
    (state) => state.status === "completed"
  ).length;
  const errorCount = fileStates.filter(
    (state) => state.status === "error"
  ).length;

  return (
    <div className="pdf-upload">
      {/* File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={PDF_CONFIG.ALLOWED_EXTENSION}
        multiple={multiple}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* File Upload Button */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="md"
          shape="square"
          className="rounded-full h-9 w-9"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isProcessing}
        >
          <Paperclip size={16} />
        </Button>

        {/* Upload All Button */}
        {pendingCount > 0 && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleUploadAll}
            disabled={isProcessing}
          >
            Upload {pendingCount} file{pendingCount > 1 ? "s" : ""}
          </Button>
        )}

        {/* Clear All Button */}
        {fileStates.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            disabled={isProcessing}
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Upload Summary */}
      {fileStates.length > 0 && (
        <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          {fileStates.length} file{fileStates.length > 1 ? "s" : ""} selected
          {completedCount > 0 && ` • ${completedCount} completed`}
          {errorCount > 0 && ` • ${errorCount} failed`}
        </div>
      )}

      {/* File List */}
      {fileStates.length > 0 && (
        <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
          {fileStates.map((fileState, index) => (
            <div
              key={`${fileState.file.name}-${index}`}
              className="flex items-center justify-between bg-white dark:bg-neutral-800 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <svg
                    className="w-4 h-4 text-red-600 dark:text-red-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {fileState.file.name}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {(fileState.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <span className="text-xs">•</span>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {getStatusText(fileState)}
                    </p>
                    {getStatusIcon(fileState.status)}
                  </div>
                  {(fileState.status === "uploading" ||
                    fileState.status === "generating-url" ||
                    fileState.status === "confirming") && (
                    <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-1 mt-1">
                      <div
                        className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                        style={{
                          width:
                            fileState.status === "uploading"
                              ? `${fileState.progress}%`
                              : fileState.status === "generating-url"
                                ? "20%"
                                : "90%",
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveFile(index)}
                disabled={isProcessing}
              >
                <X size={16} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
