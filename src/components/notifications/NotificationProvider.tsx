import type React from "react";
import { createContext, useContext, useState } from "react";
import type { NotificationPayload } from "../../durable-objects/notification-hub";
import { useNotificationStream } from "../../hooks/useNotificationStream";
import { NotificationBell } from "./NotificationBell";

interface NotificationContextType {
  notifications: NotificationPayload[];
  isConnected: boolean;
  error: string | null;
  clearNotifications: () => void;
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
        // Add to active notifications for display
        setActiveNotifications((prev) => [notification, ...prev]);
      },
      reconnectTrigger: isAuthenticated, // Trigger reconnection when auth state changes
    });

  const dismissNotification = (timestamp: number) => {
    setActiveNotifications((prev) =>
      prev.filter((notification) => notification.timestamp !== timestamp)
    );
  };

  const contextValue: NotificationContextType = {
    notifications,
    isConnected,
    error,
    clearNotifications,
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}

      {/* Render notification bell */}
      <div className="fixed top-4 right-4 z-50">
        <NotificationBell
          notifications={activeNotifications}
          onDismiss={(notificationId) => {
            const timestamp = parseInt(notificationId.split("-")[0], 10);
            dismissNotification(timestamp);
          }}
          onDismissAll={() => setActiveNotifications([])}
        />
      </div>

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
