import { useCallback, useState } from "react";
import type { FileUploadEvent } from "../lib/event-bus";
import { EVENT_TYPES, useEvent, useEventBus } from "../lib/event-bus";

// Status constants
export const UPLOAD_STATUS = {
  IDLE: "idle",
  UPLOADING: "uploading",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type UploadStatus = (typeof UPLOAD_STATUS)[keyof typeof UPLOAD_STATUS];

function logEventFilteringMismatch(
  hookName: string,
  expected: Record<string, any>,
  event: Record<string, any>,
  eventType: string
) {
  console.error(`[${hookName}] Event filtering mismatch:`, {
    ...expected,
    eventType,
    eventData: event,
  });
}

function shouldProcessFileUploadEvent(
  fileKey: string | undefined,
  eventFileKey: string
): boolean {
  return !fileKey || eventFileKey === fileKey;
}

function handleFileUploadEvent<_T>(
  fileKey: string | undefined,
  event: FileUploadEvent,
  onMatch: () => void,
  hookName: string = "useFileUploadStatus"
) {
  if (shouldProcessFileUploadEvent(fileKey, event.fileKey)) {
    onMatch();
  } else {
    logEventFilteringMismatch(
      hookName,
      { expectedFileKey: fileKey },
      { eventFileKey: event.fileKey },
      event.type
    );
  }
}

// Enhanced async state management with event bus integration
export interface AsyncState<T = any> {
  data: T;
  loading: boolean;
  error: string | null;
  lastUpdated: number;
}

export function useAsyncState<T = any>(
  initialData: T
): [
  AsyncState<T>,
  {
    setLoading: (loading: boolean) => void;
    setData: (data: T) => void;
    setError: (error: string | null) => void;
    reset: () => void;
  },
] {
  const [state, setState] = useState<AsyncState<T>>({
    data: initialData,
    loading: false,
    error: null,
    lastUpdated: 0,
  });

  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, loading }));
  }, []);

  const setData = useCallback((data: T) => {
    setState((prev) => ({
      ...prev,
      data,
      loading: false,
      error: null,
      lastUpdated: Date.now(),
    }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({
      ...prev,
      error,
      loading: false,
      lastUpdated: Date.now(),
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      data: initialData,
      loading: false,
      error: null,
      lastUpdated: 0,
    });
  }, [initialData]);

  return [state, { setLoading, setData, setError, reset }];
}

// Hook for tracking file upload status via events
export function useFileUploadStatus(fileKey?: string) {
  // Log warning if no fileKey is provided (will listen to all events)
  if (!fileKey) {
    console.warn(
      "[useFileUploadStatus] No fileKey provided - will listen to all file upload events"
    );
  }
  const [uploadState, setUploadState] = useState<{
    status: UploadStatus;
    progress: number;
    message: string;
    error?: string;
  }>({
    status: UPLOAD_STATUS.IDLE,
    progress: 0,
    message: "",
  });

  const send = useEvent();

  // Listen for file upload events
  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.STARTED,
    (event) => {
      handleFileUploadEvent(fileKey, event, () => {
        setUploadState({
          status: UPLOAD_STATUS.UPLOADING,
          progress: 0,
          message: "Upload started...",
        });
      });
    },
    [fileKey]
  );

  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.PROGRESS,
    (event) => {
      handleFileUploadEvent(fileKey, event, () => {
        setUploadState((prev) => ({
          ...prev,
          progress: event.progress || 0,
          message: `Uploading... ${event.progress || 0}%`,
        }));
      });
    },
    [fileKey]
  );

  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.COMPLETED,
    (event) => {
      handleFileUploadEvent(fileKey, event, () => {
        setUploadState({
          status: UPLOAD_STATUS.COMPLETED,
          progress: 100,
          message: "Upload completed successfully!",
        });
      });
    },
    [fileKey]
  );

  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.FAILED,
    (event) => {
      handleFileUploadEvent(fileKey, event, () => {
        setUploadState({
          status: UPLOAD_STATUS.FAILED,
          progress: 0,
          message: "Upload failed",
          error: event.error,
        });
      });
    },
    [fileKey]
  );

  const emitUploadEvent = useCallback(
    (event: Omit<FileUploadEvent, "timestamp" | "source">) => {
      send({
        ...event,
        source: "useFileUploadStatus",
      });
    },
    [send]
  );

  return {
    uploadState,
    emitUploadEvent,
  };
}
