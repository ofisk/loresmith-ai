import type React from "react";
import { createContext, useContext, useState, useEffect } from "react";
import type { NotificationPayload } from "../../durable-objects/notification-hub";
import { NOTIFICATION_TYPES } from "../../constants/notification-types";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import { useNotificationStream } from "../../hooks/useNotificationStream";
import { JWT_STORAGE_KEY } from "@/app-constants";

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

  // Check if user has a token (fallback if isAuthenticated not provided)
  const [hasToken, setHasToken] = useState(() => {
    if (typeof isAuthenticated === "boolean") return isAuthenticated;
    return !!localStorage.getItem(JWT_STORAGE_KEY);
  });

  // Update hasToken when isAuthenticated changes
  useEffect(() => {
    if (typeof isAuthenticated === "boolean") {
      setHasToken(isAuthenticated);
    }
  }, [isAuthenticated]);

  const shouldConnect = hasToken;

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
              new CustomEvent(APP_EVENT_TYPE.UI_HINT, {
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
                  new CustomEvent(APP_EVENT_TYPE.FILE_STATUS_UPDATED, {
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
                  new CustomEvent(APP_EVENT_TYPE.FILE_CHANGED, {
                    detail: {
                      // Include complete file data if available (for in-place updates)
                      completeFileData: notification?.data?.completeFileData,
                      // Also include individual fields for backward compatibility
                      type: APP_EVENT_TYPE.FILE_CHANGED,
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
                  new CustomEvent(APP_EVENT_TYPE.CAMPAIGN_CREATED, {
                    detail: {
                      type: APP_EVENT_TYPE.CAMPAIGN_CREATED,
                      campaignName: notification?.data?.campaignName,
                      campaignDescription:
                        notification?.data?.campaignDescription,
                    },
                  })
                );
                break;
              }
              case NOTIFICATION_TYPES.CAMPAIGN_DELETED: {
                // Dispatch campaign deleted event to trigger UI refresh
                window.dispatchEvent(
                  new CustomEvent(APP_EVENT_TYPE.CAMPAIGN_DELETED, {
                    detail: {
                      type: APP_EVENT_TYPE.CAMPAIGN_DELETED,
                      campaignId: notification?.data?.campaignId,
                      campaignName: notification?.data?.campaignName,
                    },
                  })
                );
                break;
              }
              case NOTIFICATION_TYPES.SHARDS_GENERATED: {
                // Dispatch shards-generated event to trigger overlay refresh
                window.dispatchEvent(
                  new CustomEvent(APP_EVENT_TYPE.SHARDS_GENERATED, {
                    detail: {
                      type: APP_EVENT_TYPE.SHARDS_GENERATED,
                      campaignId: notification?.data?.campaignId,
                      campaignName: notification?.data?.campaignName,
                      shardCount: notification?.data?.shardCount,
                    },
                  })
                );

                // Dispatch entity extraction completed event to update UI without polling
                window.dispatchEvent(
                  new CustomEvent(APP_EVENT_TYPE.ENTITY_EXTRACTION_COMPLETED, {
                    detail: {
                      campaignId: notification?.data?.campaignId,
                      resourceId: notification?.data?.resourceId,
                      shardCount: notification?.data?.shardCount,
                      fileName: notification?.data?.fileName,
                    },
                  })
                );

                // If a ui_hint is present, broadcast it too (handled above)
                const uiHint2 = notification?.data?.ui_hint;
                if (uiHint2) {
                  window.dispatchEvent(
                    new CustomEvent(APP_EVENT_TYPE.UI_HINT, {
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
              case NOTIFICATION_TYPES.REBUILD_STARTED:
              case NOTIFICATION_TYPES.REBUILD_PROGRESS:
              case NOTIFICATION_TYPES.REBUILD_COMPLETED:
              case NOTIFICATION_TYPES.REBUILD_FAILED:
              case NOTIFICATION_TYPES.REBUILD_CANCELLED: {
                // Dispatch rebuild status change event to update UI without polling
                window.dispatchEvent(
                  new CustomEvent(APP_EVENT_TYPE.REBUILD_STATUS_CHANGED, {
                    detail: {
                      type: APP_EVENT_TYPE.REBUILD_STATUS_CHANGED,
                      campaignId: notification?.data?.campaignId,
                      rebuildId: notification?.data?.rebuildId,
                      status: notification?.data?.status,
                      rebuildType: notification?.data?.rebuildType,
                      metadata: notification?.data?.metadata,
                      errorMessage: notification?.data?.errorMessage,
                    },
                  })
                );
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
      reconnectTrigger: shouldConnect, // Trigger reconnection when auth state changes
      enabled: shouldConnect, // Only connect if authenticated
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

      {/* Connection status indicator - only show if authenticated */}
      {!isConnected && shouldConnect && (
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
