import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "./useToast";
import type { UserNotification } from "../services/notification-service";

interface UseNotificationsOptions {
  /**
   * Polling interval in milliseconds
   * @default 30000 (30 seconds)
   */
  pollingInterval?: number;
  /**
   * Whether to show toast notifications for new notifications
   * @default true
   */
  showToasts?: boolean;
  /**
   * Whether to automatically mark notifications as read when toasts are shown
   * @default true
   */
  autoMarkAsRead?: boolean;
  /**
   * JWT token for authentication
   */
  jwt?: string | null;
}

interface NotificationState {
  notifications: UserNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
}

/**
 * Hook for managing user notifications with background polling and toast integration
 */
export function useNotifications(options: UseNotificationsOptions = {}) {
  const {
    pollingInterval = 30000, // 30 seconds
    showToasts = true,
    autoMarkAsRead = true,
    jwt,
  } = options;

  const { showSuccess, showError } = useToast();
  const [state, setState] = useState<NotificationState>({
    notifications: [],
    unreadCount: 0,
    loading: false,
    error: null,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckRef = useRef<string | null>(null);

  /**
   * Fetch unread notifications from the API
   */
  const fetchUnreadNotifications = useCallback(async () => {
    if (!jwt) return;

    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const response = await fetch("/notifications/unread", {
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch notifications: ${response.status}`);
      }

      const data = (await response.json()) as {
        notifications?: UserNotification[];
      };
      const notifications: UserNotification[] = data.notifications || [];

      // Check for new notifications since last check
      const newNotifications = lastCheckRef.current
        ? notifications.filter(
            (notification) => notification.created_at > lastCheckRef.current!
          )
        : [];

      // Show toast notifications for new notifications
      if (showToasts && newNotifications.length > 0) {
        for (const notification of newNotifications) {
          if (notification.notification_type === "file_processing_complete") {
            showSuccess(notification.message, 6000);
          } else if (
            notification.notification_type === "file_processing_error"
          ) {
            showError(notification.message, 8000);
          }
        }
      }

      // Update last check timestamp
      if (notifications.length > 0) {
        const timestamps = notifications.map((n) =>
          new Date(n.created_at).getTime()
        );
        const latestTimestamp = Math.max(...timestamps);
        lastCheckRef.current = new Date(latestTimestamp).toISOString();
      }

      setState((prev) => ({
        ...prev,
        notifications,
        unreadCount: notifications.length,
        loading: false,
      }));
    } catch (error) {
      console.error("Error fetching notifications:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch notifications",
      }));
    }
  }, [jwt, showToasts, showSuccess, showError]);

  /**
   * Mark a notification as read
   */
  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!jwt) return false;

      try {
        const response = await fetch(`/notifications/${notificationId}/read`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${jwt}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          setState((prev) => ({
            ...prev,
            notifications: prev.notifications.filter(
              (n) => n.id !== notificationId
            ),
            unreadCount: Math.max(0, prev.unreadCount - 1),
          }));
          return true;
        }
        return false;
      } catch (error) {
        console.error("Error marking notification as read:", error);
        return false;
      }
    },
    [jwt]
  );

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(async () => {
    if (!jwt) return false;

    try {
      const response = await fetch("/notifications/read-all", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        setState((prev) => ({
          ...prev,
          notifications: [],
          unreadCount: 0,
        }));
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      return false;
    }
  }, [jwt]);

  /**
   * Fetch all notifications with pagination
   */
  const fetchAllNotifications = useCallback(
    async (limit: number = 50, offset: number = 0) => {
      if (!jwt) return { notifications: [], total: 0, hasMore: false };

      try {
        const response = await fetch(
          `/notifications?limit=${limit}&offset=${offset}`,
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch notifications: ${response.status}`);
        }

        const data = (await response.json()) as {
          notifications?: UserNotification[];
          total?: number;
          hasMore?: boolean;
        };
        return {
          notifications: data.notifications || [],
          total: data.total || 0,
          hasMore: data.hasMore || false,
        };
      } catch (error) {
        console.error("Error fetching all notifications:", error);
        return { notifications: [], total: 0, hasMore: false };
      }
    },
    [jwt]
  );

  /**
   * Start background polling
   */
  const startPolling = useCallback(() => {
    if (!jwt || intervalRef.current) return;

    // Initial fetch
    fetchUnreadNotifications();

    // Set up polling
    intervalRef.current = setInterval(
      fetchUnreadNotifications,
      pollingInterval
    );
    console.log(
      `[useNotifications] Started polling every ${pollingInterval}ms`
    );
  }, [jwt, fetchUnreadNotifications, pollingInterval]);

  /**
   * Stop background polling
   */
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log("[useNotifications] Stopped polling");
    }
  }, []);

  /**
   * Refresh notifications manually
   */
  const refresh = useCallback(() => {
    fetchUnreadNotifications();
  }, [fetchUnreadNotifications]);

  // Start/stop polling based on JWT availability
  useEffect(() => {
    if (jwt) {
      startPolling();
    } else {
      stopPolling();
      setState({
        notifications: [],
        unreadCount: 0,
        loading: false,
        error: null,
      });
    }

    return stopPolling;
  }, [jwt, startPolling, stopPolling]);

  // Auto-mark notifications as read when they appear
  useEffect(() => {
    if (autoMarkAsRead && state.notifications.length > 0) {
      state.notifications.forEach((notification) => {
        markAsRead(notification.id);
      });
    }
  }, [state.notifications, autoMarkAsRead, markAsRead]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    // State
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    loading: state.loading,
    error: state.error,

    // Actions
    markAsRead,
    markAllAsRead,
    fetchAllNotifications,
    refresh,
    startPolling,
    stopPolling,
  };
}
