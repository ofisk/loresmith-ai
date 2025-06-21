/**
 * PDF Upload Integration Hook
 *
 * Manages PDF upload state, error handling, and admin secret integration.
 * This centralizes PDF upload logic that was previously scattered throughout
 * the application.
 */

import { useAdmin } from "@/contexts/AdminContext";
import { useCallback } from "react";

export interface PdfUploadCallbacks {
  // Optional properties
  onFileUploadComplete?: (file: File, result: unknown) => void;
  onUploadError?: (error: string) => void;
  onUploadStart?: (files: File[]) => void;
}

export interface UsePdfUploadReturn {
  // Required properties
  adminSecret: string;
  handleFileUploadComplete: (file: File, result: unknown) => void;
  handleUploadError: (error: string) => void;
  handleUploadStart: (files: File[]) => void;
  isVerified: boolean;
}

/**
 * Hook for managing PDF upload integration
 */
export function usePdfUpload(
  callbacks: PdfUploadCallbacks = {}
): UsePdfUploadReturn {
  const {
    adminSecret,
    isVerified,
    handleUploadError: handleAdminError,
  } = useAdmin();

  const handleUploadStart = useCallback(
    (files: File[]) => {
      // Log upload start
      const fileNames = files.map((f) => f.name).join(", ");
      console.log(`Starting upload of: ${fileNames}`);

      // Call custom callback if provided
      callbacks.onUploadStart?.(files);
    },
    [callbacks]
  );

  const handleFileUploadComplete = useCallback(
    (file: File, result: unknown) => {
      // Log upload completion
      console.log(`Upload completed: ${file.name}`, result);

      // Call custom callback if provided
      callbacks.onFileUploadComplete?.(file, result);
    },
    [callbacks]
  );

  const handleUploadError = useCallback(
    (error: string) => {
      // Handle admin secret errors
      handleAdminError(error);

      // Call custom callback if provided
      callbacks.onUploadError?.(error);
    },
    [callbacks, handleAdminError]
  );

  return {
    handleUploadStart,
    handleFileUploadComplete,
    handleUploadError,
    adminSecret,
    isVerified,
  };
}
