import { useCallback, useEffect, useRef, useState } from "react";
import {
  AuthService,
  authenticatedFetchWithExpiration,
} from "../services/auth-service";
import { API_CONFIG } from "../shared";
import { useEventEmitter, EVENT_TYPES } from "../lib/event-bus";
import type { AutoRAGEvent } from "../lib/event-bus";

export interface AutoRAGJobStatus {
  id: string;
  source: string;
  end_reason?: string;
  ended_at?: string;
  last_seen_at?: string;
  started_at: string;
}

export interface UseAutoRAGPollingReturn {
  jobStatus: AutoRAGJobStatus | null;
  isPolling: boolean;
  startPolling: (ragId: string, jobId: string, fileKey?: string) => void;
  stopPolling: () => void;
  error: string | null;
}

export function useAutoRAGPolling(): UseAutoRAGPollingReturn {
  const [jobStatus, setJobStatus] = useState<AutoRAGJobStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const emit = useEventEmitter();

  const stopPolling = useCallback(() => {
    console.log("[useAutoRAGPolling] Stopping polling");
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setIsPolling(false);
  }, []);

  const checkJobStatus = useCallback(
    async (ragId: string, jobId: string, fileKey?: string) => {
      console.log("Checking job status for", ragId, jobId);
      try {
        const url = API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.AUTORAG.JOB_DETAILS(ragId, jobId)
        );

        const jwt = AuthService.getStoredJwt();
        const response = await authenticatedFetchWithExpiration(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          signal: abortControllerRef.current?.signal,
          jwt,
        });

        if (response.jwtExpired) {
          throw new Error("Authentication expired. Please log in again.");
        }

        if (!response.response.ok) {
          throw new Error(
            `HTTP ${response.response.status}: ${response.response.statusText}`
          );
        }

        const result = (await response.response.json()) as {
          success: boolean;
          result: AutoRAGJobStatus;
        };

        if (!result.success) {
          throw new Error("Failed to get job status");
        }

        setJobStatus(result.result);
        setError(null);

        // Emit progress event
        emit({
          type: EVENT_TYPES.AUTORAG_SYNC.PROGRESS,
          ragId,
          jobId,
          fileKey,
          progress: result.result.ended_at ? 100 : 50, // Estimate progress
          source: "useAutoRAGPolling",
        } as AutoRAGEvent);

        // Stop polling if the job has ended
        if (result.result.ended_at) {
          console.log("[useAutoRAGPolling] Job ended, stopping polling");

          const isSuccess =
            !result.result.end_reason ||
            result.result.end_reason === "completed";

          // Emit completion event
          emit({
            type: isSuccess
              ? EVENT_TYPES.AUTORAG_SYNC.COMPLETED
              : EVENT_TYPES.AUTORAG_SYNC.FAILED,
            ragId,
            jobId,
            fileKey,
            error: isSuccess ? undefined : result.result.end_reason,
            source: "useAutoRAGPolling",
          } as AutoRAGEvent);

          stopPolling();
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Request was aborted, ignore
          return;
        }

        console.error("[useAutoRAGPolling] Error checking job status:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);

        // Emit failure event
        emit({
          type: EVENT_TYPES.AUTORAG_SYNC.FAILED,
          ragId,
          jobId,
          fileKey,
          error: errorMessage,
          source: "useAutoRAGPolling",
        } as AutoRAGEvent);
      }
    },
    [stopPolling, emit]
  );

  const startPolling = useCallback(
    (ragId: string, jobId: string, fileKey?: string) => {
      // Stop any existing polling
      stopPolling();

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      // Reset state
      setJobStatus(null);
      setError(null);
      setIsPolling(true);

      // Emit start event
      emit({
        type: EVENT_TYPES.AUTORAG_SYNC.STARTED,
        ragId,
        jobId,
        fileKey,
        source: "useAutoRAGPolling",
      } as AutoRAGEvent);

      // Check status immediately
      checkJobStatus(ragId, jobId, fileKey);

      // Start polling every 2 seconds
      intervalRef.current = setInterval(() => {
        checkJobStatus(ragId, jobId, fileKey);
      }, 2000);
    },
    [checkJobStatus, stopPolling, emit]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    jobStatus,
    isPolling,
    startPolling,
    stopPolling,
    error,
  };
}
