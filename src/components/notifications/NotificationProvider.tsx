import type React from "react";
import { createContext, useContext, useState } from "react";
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

        // Fire decoupled UI hint events if present
        const uiHint = notification?.data?.ui_hint;
        if (uiHint && typeof window !== "undefined") {
          try {
            window.dispatchEvent(
              new CustomEvent("ui-hint", {
                detail: {
                  type: uiHint.type,
                  data: uiHint.data,
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
              case NOTIFICATION_TYPES.INDEXING_FAILED:
              case NOTIFICATION_TYPES.FILE_STATUS_UPDATED: {
                window.dispatchEvent(
                  new CustomEvent("file-status-updated", {
                    detail: {
                      // Include complete file data if available (for in-place updates)
                      completeFileData: notification?.data?.completeFileData,
                      // Also include individual fields for backward compatibility
                      fileKey: notification?.data?.fileKey,
                      fileName: notification?.data?.fileName,
                      status: notification?.data?.status,
                      fileSize: notification?.data?.fileSize,
                    },
                  })
                );
                break;
              }
              case NOTIFICATION_TYPES.FILE_UPLOADED:
              case NOTIFICATION_TYPES.FILE_UPLOAD_FAILED: {
                // Pass through all the file data for immediate UI updates
                window.dispatchEvent(
                  new CustomEvent("file-changed", {
                    detail: {
                      // Include complete file data if available (for in-place updates)
                      completeFileData: notification?.data?.completeFileData,
                      // Also include individual fields for backward compatibility
                      type: "file-changed",
                      fileName: notification?.data?.fileName,
                      fileSize: notification?.data?.fileSize,
                    },
                  })
                );
                break;
              }
              case NOTIFICATION_TYPES.CAMPAIGN_CREATED: {
                // Dispatch campaign created event to trigger UI refresh
                window.dispatchEvent(
                  new CustomEvent("campaign-created", {
                    detail: {
                      type: "campaign-created",
                      campaignName: notification?.data?.campaignName,
                      campaignDescription:
                        notification?.data?.campaignDescription,
                    },
                  })
                );
                break;
              }
              case NOTIFICATION_TYPES.SHARDS_GENERATED: {
                // If a ui_hint is present, broadcast it too (handled above)
                const uiHint2 = notification?.data?.ui_hint;
                if (uiHint2) {
                  window.dispatchEvent(
                    new CustomEvent("ui-hint", {
                      detail: {
                        type: uiHint2.type,
                        data: uiHint2.data,
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
        <div className="fixed bottom-4 right-4 z-[99998]">
          <div className="bg-yellow-900/20 border border-yellow-700/30 text-yellow-300 px-3 py-2 rounded shadow">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
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
