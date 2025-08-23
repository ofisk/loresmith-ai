import { useState, useEffect, useCallback, useRef } from "react";
import { API_CONFIG } from "../shared";
import {
  authenticatedFetchWithExpiration,
  AuthService,
} from "../services/auth-service";

export interface AutoRAGStatus {
  status: "processing" | "ready" | "error" | "not_found";
  message: string;
  tenant?: string;
  doc?: string;
  type?: "single_file" | "split_file" | "staging";
  lastUpdate?: string;
  timestamp?: string;
}

export interface UseAutoRAGPollingReturn {
  status: AutoRAGStatus | null;
  isPolling: boolean;
  startPolling: (tenant: string, filename: string) => void;
  stopPolling: () => void;
  error: string | null;
}

export function useAutoRAGPolling(): UseAutoRAGPollingReturn {
  const [status, setStatus] = useState<AutoRAGStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  const checkStatus = useCallback(
    async (tenant: string, filename: string) => {
      console.log("Checking status for", tenant, filename);
      try {
        const url = `${API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.INGESTION.STATUS
        )}?tenant=${encodeURIComponent(tenant)}&doc=${encodeURIComponent(filename)}`;

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

        const result = (await response.response.json()) as AutoRAGStatus;
        setStatus(result);
        setError(null);

        // Stop polling if the file is ready or there's an error
        if (
          result.status === "ready" ||
          result.status === "error" ||
          result.status === "not_found"
        ) {
          stopPolling();
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Request was aborted, ignore
          return;
        }

        console.error("[useAutoRAGPolling] Error checking status:", err);
        setError(err instanceof Error ? err.message : "Unknown error");

        // Don't stop polling on network errors, just log them
      }
    },
    [stopPolling]
  );

  const startPolling = useCallback(
    (tenant: string, filename: string) => {
      // Stop any existing polling
      stopPolling();

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      // Reset state
      setStatus(null);
      setError(null);
      setIsPolling(true);

      // Check status immediately
      checkStatus(tenant, filename);

      // Start polling every second
      intervalRef.current = setInterval(() => {
        checkStatus(tenant, filename);
      }, 1000);
    },
    [checkStatus, stopPolling]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    status,
    isPolling,
    startPolling,
    stopPolling,
    error,
  };
}
