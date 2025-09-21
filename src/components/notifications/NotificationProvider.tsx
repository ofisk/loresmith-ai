import React, { createContext, useContext, useState } from "react";
import type { NotificationPayload } from "../../durable-objects/notification-hub";
import { NOTIFICATION_TYPES } from "../../constants/notification-types";
import { useNotificationStream } from "../../hooks/useNotificationStream";

interface NotificationContextType {
  notifications: NotificationPayload[];
  isConnected: boolean;
  error: string | null;
  clearNotifications: () => void;
  // Active, user-visible notifications (toast list)
  activeNotifications: NotificationPayload[];
  dismissNotification: (timestamp: number) => void;
  clearActiveNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

interface NotificationProviderProps {
  children: React.ReactNode;
  /** Trigger to restart the notification stream when authentication state changes */
  isAuthenticated?: boolean;
}

export function NotificationProvider({
  children,
  isAuthenticated,
}: NotificationProviderProps) {
  // Basic mount log to confirm provider is rendered client-side
  console.log(
    "[NotificationProvider] mounted. isAuthenticated:",
    Boolean(isAuthenticated)
  );
  const [activeNotifications, setActiveNotifications] = useState<
    NotificationPayload[]
  >([]);

  const { notifications, isConnected, error, clearNotifications } =
    useNotificationStream({
      onNotification: (notification) => {
        // System/hidden notifications should not show a toast
        const hidden =
          notification?.data?.hidden === true ||
          notification?.type?.startsWith?.("system:");

        console.log(
          "[NotificationProvider] onNotification:",
          notification?.type,
          hidden ? "(hidden)" : ""
        );

        // Fire UI render events if present
        const render = notification?.data?.render_component;
        if (render && typeof window !== "undefined") {
          try {
            window.dispatchEvent(
              new CustomEvent("ui-render-component", {
                detail: {
                  component: render.component,
                  props: render.props || {},
                  origin: notification.type,
                },
              })
            );
          } catch (_e) {}
        }

        // Emit app-level events for file/indexing state changes to avoid polling
        if (typeof window !== "undefined") {
          try {
            switch (notification?.type) {
              case NOTIFICATION_TYPES.INDEXING_STARTED:
              case NOTIFICATION_TYPES.INDEXING_COMPLETED:
              case NOTIFICATION_TYPES.INDEXING_FAILED: {
                const fileName = notification?.data?.fileName;
                window.dispatchEvent(
                  new CustomEvent("file-status-updated", {
                    detail: { updatedCount: 1, fileName },
                  })
                );
                break;
              }
              case NOTIFICATION_TYPES.FILE_UPLOADED:
              case NOTIFICATION_TYPES.FILE_UPLOAD_FAILED: {
                const fileName = notification?.data?.fileName;
                window.dispatchEvent(
                  new CustomEvent("file-changed", {
                    detail: { type: "file-changed", fileName },
                  })
                );
                break;
              }
              case NOTIFICATION_TYPES.SHARDS_GENERATED: {
                // Also ensure shard UI render triggers via SSE path
                const render2 = notification?.data?.render_component;
                if (render2?.component === "ShardManagementUI") {
                  window.dispatchEvent(
                    new CustomEvent("ui-render-component", {
                      detail: {
                        component: render2.component,
                        props: render2.props || {},
                        origin: notification.type,
                      },
                    })
                  );
                }
                break;
              }
              default:
                break;
            }
          } catch (_e) {}
        }

        if (!hidden) {
          setActiveNotifications((prev) => [notification, ...prev]);
        }
      },
      reconnectTrigger: isAuthenticated, // Trigger reconnection when auth state changes
    });

  // Debug current list whenever it changes
  React.useEffect(() => {
    console.log(
      "[NotificationProvider] activeNotifications count:",
      activeNotifications.length
    );
  }, [activeNotifications]);

  const dismissNotification = (timestamp: number) => {
    setActiveNotifications((prev) =>
      prev.filter((notification) => notification.timestamp !== timestamp)
    );
  };

  const clearActiveNotifications = () => setActiveNotifications([]);

  const contextValue: NotificationContextType = {
    notifications,
    isConnected,
    error,
    clearNotifications,
    activeNotifications,
    dismissNotification,
    clearActiveNotifications,
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}

      {/* Bell is rendered by the top bar consumer to avoid overlap */}

      {/* Connection status indicator */}
      {!isConnected && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-3 py-2 rounded shadow">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
              <span className="text-sm">Reconnecting to notifications...</span>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider"
    );
  }
  return context;
}
