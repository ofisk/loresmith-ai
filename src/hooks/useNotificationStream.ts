import { useCallback, useEffect, useRef, useState } from "react";
import { JWT_STORAGE_KEY } from "../constants";
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
    console.log(
      "[useNotificationStream] Attempting to connect, token available:",
      !!token
    );

    if (!token) {
      console.log("[useNotificationStream] No JWT token found, cannot connect");
      setState((prev) => ({
        ...prev,
        error: "No authentication token found",
        isConnected: false,
      }));
      isConnectingRef.current = false;
      return;
    }

    // Basic JWT validation - check if it's a valid JWT format
    try {
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid JWT format");
      }

      // Check if JWT is expired by decoding the payload
      const payload = JSON.parse(atob(parts[1]));
      if (payload.exp && payload.exp < Date.now() / 1000) {
        console.log("[useNotificationStream] JWT token is expired");
        localStorage.removeItem(JWT_STORAGE_KEY);
        setState((prev) => ({
          ...prev,
          error: "Authentication expired. Please refresh the page.",
          isConnected: false,
        }));
        isConnectingRef.current = false;
        return;
      }
    } catch (error) {
      console.log("[useNotificationStream] Invalid JWT token:", error);
      localStorage.removeItem(JWT_STORAGE_KEY);
      setState((prev) => ({
        ...prev,
        error: "Invalid authentication token. Please refresh the page.",
        isConnected: false,
      }));
      isConnectingRef.current = false;
      return;
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
      console.log("[useNotificationStream] Minting stream token...");
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

      console.log(
        "[useNotificationStream] Mint response status:",
        mintResponse.status
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

      console.log("[useNotificationStream] Mint response data:", mintData);
      console.log(
        "[useNotificationStream] Stream URL from response:",
        mintData.streamUrl
      );

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
        console.log(
          "[useNotificationStream] ✅ Connected to notification stream"
        );
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
            console.log(
              "[useNotificationStream] 🔄 Durable Object reset detected, clearing token and reconnecting"
            );
            // Clear the JWT token to force a fresh mint
            localStorage.removeItem(JWT_STORAGE_KEY);
            // Reset reconnect attempts to allow immediate reconnection
            reconnectAttempts.current = 0;
            // Close current connection
            eventSource.close();
            // Start reconnection immediately
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

          setState((prev) => ({
            ...prev,
            isConnected: true, // Fallback: treat first message as connected
            error: null,
            notifications: [notification, ...prev.notifications].slice(0, 50), // Keep last 50 notifications
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

        // Check if this is a connection close due to token expiration
        if (eventSource.readyState === 2) {
          // CLOSED
          // Reset reconnect attempts to allow immediate reconnection with fresh token
          reconnectAttempts.current = 0;

          // Clear the JWT token to force a fresh mint
          localStorage.removeItem(JWT_STORAGE_KEY);
        }

        setState((prev) => ({
          ...prev,
          isConnected: false,
          error: "Connection lost",
        }));

        optsRef.current.onError?.("Connection lost");

        // Check if this might be a 401 (token expired) by checking the readyState
        if (eventSource.readyState === EventSource.CLOSED) {
          console.log(
            "[useNotificationStream] Connection closed, likely due to token expiration"
          );
          // Reset reconnect attempts for token expiration - this is expected
          reconnectAttempts.current = 0;
        }

        // Attempt to reconnect
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000); // Exponential backoff, max 30s
          reconnectAttempts.current++;

          console.log(
            `[useNotificationStream] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`
          );

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
    console.log("[useNotificationStream] Disconnect called");
    console.log(
      "[useNotificationStream] EventSource ref exists:",
      !!eventSourceRef.current
    );
    console.log(
      "[useNotificationStream] EventSource readyState:",
      eventSourceRef.current?.readyState
    );

    if (eventSourceRef.current) {
      console.log("[useNotificationStream] Closing EventSource");
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      console.log("[useNotificationStream] Clearing reconnect timeout");
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
  }, [connect]); // Depend on the connect function

  return {
    ...state,
    connect,
    disconnect,
    clearNotifications,
  };
}
