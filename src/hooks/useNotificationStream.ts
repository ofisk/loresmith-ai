import { useCallback, useEffect, useRef, useState } from "react";
import { JWT_STORAGE_KEY } from "../constants";
import { NOTIFICATION_TYPES } from "../constants/notification-types";
import type { NotificationPayload } from "../durable-objects/notification-hub";
import { API_CONFIG } from "../shared";

export interface NotificationState {
  notifications: NotificationPayload[];
  isConnected: boolean;
  error: string | null;
}

export interface UseNotificationStreamOptions {
  onNotification?: (notification: NotificationPayload) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
  /** Trigger to restart the connection (e.g., when authentication completes) */
  reconnectTrigger?: any;
}

/**
 * Hook for managing SSE notification stream
 */
export function useNotificationStream(
  options: UseNotificationStreamOptions = {}
) {
  const [state, setState] = useState<NotificationState>({
    notifications: [],
    isConnected: false,
    error: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const isConnectingRef = useRef(false);
  const hasConnectedRef = useRef(false);

  // Keep latest callbacks without re-creating connect/disconnect
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  }, [options]);

  // Reconnect trigger is handled by the connect function dependency

  const connect = useCallback(async () => {
    if (isConnectingRef.current) {
      return;
    }

    // If we already have a connection, close it first
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    isConnectingRef.current = true;
    // Get JWT token from localStorage
    const token = localStorage.getItem(JWT_STORAGE_KEY);

    if (!token) {
      setState((prev) => ({
        ...prev,
        error: "No authentication token found",
        isConnected: false,
      }));
      isConnectingRef.current = false;
      return;
    }

    // Best-effort JWT validation for expiration. Do not clear token on parse errors.
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        // Base64URL decode
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "===".slice((base64.length + 3) % 4);
        const payload = JSON.parse(atob(padded));
        if (payload.exp && payload.exp < Date.now() / 1000) {
          localStorage.removeItem(JWT_STORAGE_KEY);
          setState((prev) => ({
            ...prev,
            error: "Authentication expired. Please refresh the page.",
            isConnected: false,
          }));
          isConnectingRef.current = false;
          return;
        }
      }
    } catch (_ignore) {
      // If we cannot parse the token locally, continue and let the server validate it.
    }

    // Close existing connection
    if (eventSourceRef.current) {
      (eventSourceRef.current as EventSource).close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      // First, mint a short-lived stream token
      const mintResponse = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.NOTIFICATIONS.MINT_STREAM),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!mintResponse.ok) {
        const errorText = await mintResponse.text();
        console.error(
          "[useNotificationStream] Mint failed:",
          mintResponse.status,
          errorText
        );

        // If 401, the JWT is invalid/expired - clear it and show auth error
        if (mintResponse.status === 401) {
          localStorage.removeItem(JWT_STORAGE_KEY);
          setState((prev) => ({
            ...prev,
            error: "Authentication expired. Please refresh the page.",
            isConnected: false,
          }));
          isConnectingRef.current = false;
          return;
        }

        throw new Error(
          `Failed to mint stream token: ${mintResponse.status} - ${errorText}`
        );
      }

      const mintData = (await mintResponse.json()) as {
        streamUrl: string;
        expiresIn: number;
      };

      const streamUrl = mintData.streamUrl;

      if (!streamUrl) {
        throw new Error("No stream URL returned from server");
      }

      // Create EventSource with the short-lived stream URL
      let eventSource: EventSource;
      try {
        eventSource = new EventSource(streamUrl);
      } catch (error) {
        console.error(
          "[useNotificationStream] Error creating EventSource:",
          error
        );
        throw error;
      }

      eventSourceRef.current = eventSource;

      // Note: Removed debugging timeout that was causing premature connection closure

      setState((prev) => ({ ...prev, isConnected: true, error: null }));

      // Handle connection open
      eventSource.onopen = () => {
        setState((prev) => ({
          ...prev,
          isConnected: true,
          error: null,
        }));
        reconnectAttempts.current = 0;
        optsRef.current.onConnect?.();
        isConnectingRef.current = false;
      };

      // Handle messages
      eventSource.onmessage = (event) => {
        try {
          const notification: NotificationPayload = JSON.parse(event.data);

          // Check if this is a Durable Object reset message
          if (notification.type === "durable-object-reset") {
            reconnectAttempts.current = 0;
            eventSource.close();
            setTimeout(() => {
              isConnectingRef.current = false;
              connect().catch((error) => {
                console.error(
                  "[useNotificationStream] Reconnection after DO reset failed:",
                  error
                );
              });
            }, 100);
            return;
          }

          if (
            notification.type === NOTIFICATION_TYPES.CONNECTED ||
            notification.type === "connected"
          ) {
            setState((prev) => ({ ...prev, isConnected: true, error: null }));
            return;
          }

          setState((prev) => ({
            ...prev,
            isConnected: true,
            error: null,
            notifications: [notification, ...prev.notifications].slice(0, 50),
          }));
          optsRef.current.onNotification?.(notification);
        } catch (error) {
          console.error(
            "[useNotificationStream] Failed to parse notification:",
            error,
            "Raw data:",
            event.data
          );
        }
      };

      // Fallback: if onopen doesn't fire (browser quirk), mark connected when ready
      setTimeout(() => {
        if (eventSource.readyState === 1) {
          setState((prev) => ({ ...prev, isConnected: true, error: null }));
          isConnectingRef.current = false;
        }
      }, 1000);

      // Handle connection errors
      eventSource.onerror = (error) => {
        console.error("[useNotificationStream] ❌ Connection error:", error);

        // If CLOSED, allow immediate reconnection without clearing main auth JWT
        if (eventSource.readyState === 2) {
          reconnectAttempts.current = 0;
        }

        setState((prev) => ({
          ...prev,
          isConnected: false,
          error: "Connection lost",
        }));

        optsRef.current.onError?.("Connection lost");

        // Check if this might be a 401 (token expired) by checking the readyState
        if (eventSource.readyState === EventSource.CLOSED) {
          // Reset reconnect attempts for token expiration - this is expected
          reconnectAttempts.current = 0;
        }

        // Attempt to reconnect
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000); // Exponential backoff, max 30s
          reconnectAttempts.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            isConnectingRef.current = false;
            connect().catch((error) => {
              console.error(
                "[useNotificationStream] Reconnection failed:",
                error
              );
            });
          }, delay);
        } else {
          console.error(
            "[useNotificationStream] Max reconnection attempts reached"
          );
          setState((prev) => ({
            ...prev,
            error: "Failed to reconnect after multiple attempts",
          }));
          optsRef.current.onDisconnect?.();
          isConnectingRef.current = false;
        }
      };
    } catch (error) {
      console.error(
        "[useNotificationStream] Failed to create EventSource:",
        error
      );
      setState((prev) => ({
        ...prev,
        error: "Failed to connect to notification stream",
        isConnected: false,
      }));
      isConnectingRef.current = false;
    }
  }, []);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      isConnected: false,
    }));
    isConnectingRef.current = false;
    hasConnectedRef.current = false; // Reset connection flag
  }, []);

  const clearNotifications = () => {
    setState((prev) => ({
      ...prev,
      notifications: [],
    }));
  };

  // Auto-connect on mount and when reconnect trigger changes
  useEffect(() => {
    const initConnection = async () => {
      try {
        await connect();
        hasConnectedRef.current = true;
      } catch (error) {
        console.error("[useNotificationStream] Failed to connect:", error);
        setState((prev) => ({
          ...prev,
          error: "Failed to connect to notification stream",
          isConnected: false,
        }));
      }
    };

    initConnection();

    // No cleanup needed - connect() function handles closing existing connections
    return () => {
      // Cleanup handled by connect() function
    };
  }, [connect]);

  return {
    ...state,
    connect,
    disconnect,
    clearNotifications,
  };
}
