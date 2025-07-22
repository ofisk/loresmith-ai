import { useCallback, useEffect, useRef, useState } from "react";
import type { ProcessingProgress, ProgressMessage } from "../types/progress";

interface UseProcessingProgressOptions {
  fileKey?: string;
  onComplete?: (
    success: boolean,
    error?: string,
    suggestedMetadata?: any
  ) => void;
}

export function useProcessingProgress({
  fileKey,
  onComplete,
}: UseProcessingProgressOptions = {}) {
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/progress`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Progress WebSocket connected");
      if (fileKey) {
        ws.send(JSON.stringify({ type: "subscribe", fileKey }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const message: ProgressMessage = JSON.parse(event.data);

        if (message.type === "progress_update") {
          setProgress(message.data);
          setIsProcessing(message.data.status === "processing");
        } else if (message.type === "progress_complete") {
          setIsProcessing(false);
          if (onComplete) {
            onComplete(
              message.data.success,
              message.data.error,
              message.data.suggestedMetadata
            );
          }
        }
      } catch (error) {
        console.error("Error parsing progress message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("Progress WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("Progress WebSocket disconnected");
      // Attempt to reconnect after a delay
      setTimeout(() => {
        if (isProcessing) {
          connectWebSocket();
        }
      }, 1000);
    };

    return ws;
  }, [fileKey, isProcessing, onComplete]);

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const startProcessing = useCallback(
    (_newFileKey: string) => {
      setProgress(null);
      setIsProcessing(true);
      connectWebSocket();
    },
    [connectWebSocket]
  );

  const stopProcessing = useCallback(() => {
    setIsProcessing(false);
    disconnectWebSocket();
  }, [disconnectWebSocket]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectWebSocket();
    };
  }, [disconnectWebSocket]);

  // Auto-connect when fileKey changes
  useEffect(() => {
    if (fileKey && isProcessing) {
      connectWebSocket();
    }
  }, [fileKey, isProcessing, connectWebSocket]);

  return {
    progress,
    isProcessing,
    startProcessing,
    stopProcessing,
    connectWebSocket,
    disconnectWebSocket,
  };
}
