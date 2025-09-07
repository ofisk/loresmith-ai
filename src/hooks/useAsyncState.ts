import { useCallback, useState } from "react";
import { useEventBus, useEventEmitter, EVENT_TYPES } from "../lib/event-bus";
import type { FileUploadEvent, AutoRAGEvent } from "../lib/event-bus";

// Enhanced async state management with event bus integration
export interface AsyncState<T = any> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

export function useAsyncState<T = any>(
  initialData: T | null = null
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
    lastUpdated: null,
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
      lastUpdated: null,
    });
  }, [initialData]);

  return [state, { setLoading, setData, setError, reset }];
}

// Hook for tracking file upload status via events
export function useFileUploadStatus(fileKey?: string) {
  const [uploadState, setUploadState] = useState<{
    status: "idle" | "uploading" | "processing" | "completed" | "failed";
    progress: number;
    message: string;
    error?: string;
  }>({
    status: "idle",
    progress: 0,
    message: "",
  });

  const emit = useEventEmitter();

  // Listen for file upload events
  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.STARTED,
    (event) => {
      if (!fileKey || event.fileKey === fileKey) {
        setUploadState({
          status: "uploading",
          progress: 0,
          message: "Upload started...",
        });
      }
    },
    [fileKey]
  );

  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.PROGRESS,
    (event) => {
      if (!fileKey || event.fileKey === fileKey) {
        setUploadState((prev) => ({
          ...prev,
          progress: event.progress || 0,
          message: `Uploading... ${event.progress || 0}%`,
        }));
      }
    },
    [fileKey]
  );

  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.COMPLETED,
    (event) => {
      if (!fileKey || event.fileKey === fileKey) {
        setUploadState({
          status: "completed",
          progress: 100,
          message: "Upload completed successfully!",
        });
      }
    },
    [fileKey]
  );

  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.FAILED,
    (event) => {
      if (!fileKey || event.fileKey === fileKey) {
        setUploadState({
          status: "failed",
          progress: 0,
          message: "Upload failed",
          error: event.error,
        });
      }
    },
    [fileKey]
  );

  // Listen for AutoRAG events to update processing status
  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.STARTED,
    (event) => {
      if (!fileKey || event.fileKey === fileKey) {
        setUploadState((prev) => ({
          ...prev,
          status: "processing",
          message: "AutoRAG processing started...",
        }));
      }
    },
    [fileKey]
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.COMPLETED,
    (event) => {
      if (!fileKey || event.fileKey === fileKey) {
        setUploadState((prev) => ({
          ...prev,
          status: "completed",
          message: "File processed and indexed successfully!",
        }));
      }
    },
    [fileKey]
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.FAILED,
    (event) => {
      if (!fileKey || event.fileKey === fileKey) {
        setUploadState((prev) => ({
          ...prev,
          status: "failed",
          message: "AutoRAG processing failed",
          error: event.error,
        }));
      }
    },
    [fileKey]
  );

  const emitUploadEvent = useCallback(
    (event: Omit<FileUploadEvent, "timestamp" | "source">) => {
      emit({
        ...event,
        source: "useFileUploadStatus",
      });
    },
    [emit]
  );

  return {
    uploadState,
    emitUploadEvent,
  };
}

// Hook for tracking AutoRAG job status via events
export function useAutoRAGStatus(ragId?: string, jobId?: string) {
  const [jobState, setJobState] = useState<{
    status: "idle" | "running" | "completed" | "failed";
    progress: number;
    message: string;
    error?: string;
  }>({
    status: "idle",
    progress: 0,
    message: "",
  });

  const emit = useEventEmitter();

  // Listen for AutoRAG events
  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.STARTED,
    (event) => {
      if (
        (!ragId || event.ragId === ragId) &&
        (!jobId || event.jobId === jobId)
      ) {
        setJobState({
          status: "running",
          progress: 0,
          message: "AutoRAG sync started...",
        });
      }
    },
    [ragId, jobId]
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.PROGRESS,
    (event) => {
      if (
        (!ragId || event.ragId === ragId) &&
        (!jobId || event.jobId === jobId)
      ) {
        setJobState((prev) => ({
          ...prev,
          progress: event.progress || 0,
          message: `Processing... ${event.progress || 0}%`,
        }));
      }
    },
    [ragId, jobId]
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.COMPLETED,
    (event) => {
      if (
        (!ragId || event.ragId === ragId) &&
        (!jobId || event.jobId === jobId)
      ) {
        setJobState({
          status: "completed",
          progress: 100,
          message: "AutoRAG sync completed successfully!",
        });
      }
    },
    [ragId, jobId]
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.FAILED,
    (event) => {
      if (
        (!ragId || event.ragId === ragId) &&
        (!jobId || event.jobId === jobId)
      ) {
        setJobState({
          status: "failed",
          progress: 0,
          message: "AutoRAG sync failed",
          error: event.error,
        });
      }
    },
    [ragId, jobId]
  );

  const emitAutoRAGEvent = useCallback(
    (event: Omit<AutoRAGEvent, "timestamp" | "source">) => {
      emit({
        ...event,
        source: "useAutoRAGStatus",
      });
    },
    [emit]
  );

  return {
    jobState,
    emitAutoRAGEvent,
  };
}
