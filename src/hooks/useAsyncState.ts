import { useCallback, useState } from "react";
import { useEventBus, useEvent, EVENT_TYPES } from "../lib/event-bus";
import type { FileUploadEvent, AutoRAGEvent } from "../lib/event-bus";

// Status constants
export const UPLOAD_STATUS = {
  IDLE: "idle",
  UPLOADING: "uploading",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export const AUTORAG_STATUS = {
  IDLE: "idle",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type UploadStatus = (typeof UPLOAD_STATUS)[keyof typeof UPLOAD_STATUS];
export type AutoRAGStatus =
  (typeof AUTORAG_STATUS)[keyof typeof AUTORAG_STATUS];

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

function shouldProcessAutoRAGEvent(
  ragId: string | undefined,
  jobId: string | undefined,
  eventRagId: string,
  eventJobId: string
): boolean {
  return (!ragId || eventRagId === ragId) && (!jobId || eventJobId === jobId);
}

function handleFileUploadEvent<T>(
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

function handleFileKeyEvent<T extends { fileKey?: string; type: string }>(
  fileKey: string | undefined,
  event: T,
  onMatch: () => void,
  hookName: string = "useFileUploadStatus"
) {
  if (shouldProcessFileUploadEvent(fileKey, event.fileKey || "")) {
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

function handleAutoRAGEvent<T>(
  ragId: string | undefined,
  jobId: string | undefined,
  event: AutoRAGEvent,
  onMatch: () => void,
  hookName: string = "useAutoRAGStatus"
) {
  if (shouldProcessAutoRAGEvent(ragId, jobId, event.ragId, event.jobId)) {
    onMatch();
  } else {
    logEventFilteringMismatch(
      hookName,
      { expectedRagId: ragId, expectedJobId: jobId },
      { eventRagId: event.ragId, eventJobId: event.jobId },
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

  // Listen for AutoRAG events to update processing status
  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.STARTED,
    (event) => {
      handleFileKeyEvent(fileKey, event, () => {
        setUploadState((prev) => ({
          ...prev,
          status: UPLOAD_STATUS.PROCESSING,
          message: "AutoRAG processing started...",
        }));
      });
    },
    [fileKey]
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.COMPLETED,
    (event) => {
      handleFileKeyEvent(fileKey, event, () => {
        setUploadState((prev) => ({
          ...prev,
          status: UPLOAD_STATUS.COMPLETED,
          message: "File processed and indexed successfully!",
        }));
      });
    },
    [fileKey]
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.FAILED,
    (event) => {
      handleFileKeyEvent(fileKey, event, () => {
        setUploadState((prev) => ({
          ...prev,
          status: UPLOAD_STATUS.FAILED,
          message: "AutoRAG processing failed",
          error: event.error,
        }));
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

// Hook for tracking AutoRAG job status via events
export function useAutoRAGStatus(ragId?: string, jobId?: string) {
  // Log warning if no filtering parameters are provided (will listen to all events)
  if (!ragId && !jobId) {
    console.warn(
      "[useAutoRAGStatus] No ragId or jobId provided - will listen to all AutoRAG events"
    );
  }
  const [jobState, setJobState] = useState<{
    status: AutoRAGStatus;
    progress: number;
    message: string;
    error?: string;
  }>({
    status: AUTORAG_STATUS.IDLE,
    progress: 0,
    message: "",
  });

  const send = useEvent();

  // Listen for AutoRAG events
  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.STARTED,
    (event) => {
      handleAutoRAGEvent(ragId, jobId, event, () => {
        setJobState({
          status: AUTORAG_STATUS.RUNNING,
          progress: 0,
          message: "AutoRAG sync started...",
        });
      });
    },
    [ragId, jobId]
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.PROGRESS,
    (event) => {
      handleAutoRAGEvent(ragId, jobId, event, () => {
        setJobState((prev) => ({
          ...prev,
          progress: event.progress || 0,
          message: `Processing... ${event.progress || 0}%`,
        }));
      });
    },
    [ragId, jobId]
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.COMPLETED,
    (event) => {
      handleAutoRAGEvent(ragId, jobId, event, () => {
        setJobState({
          status: AUTORAG_STATUS.COMPLETED,
          progress: 100,
          message: "AutoRAG sync completed successfully!",
        });
      });
    },
    [ragId, jobId]
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.FAILED,
    (event) => {
      handleAutoRAGEvent(ragId, jobId, event, () => {
        setJobState({
          status: AUTORAG_STATUS.FAILED,
          progress: 0,
          message: "AutoRAG sync failed",
          error: event.error,
        });
      });
    },
    [ragId, jobId]
  );

  const emitAutoRAGEvent = useCallback(
    (event: Omit<AutoRAGEvent, "timestamp" | "source">) => {
      send({
        ...event,
        source: "useAutoRAGStatus",
      });
    },
    [send]
  );

  return {
    jobState,
    emitAutoRAGEvent,
  };
}
