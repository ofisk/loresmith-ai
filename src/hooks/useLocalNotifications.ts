import { useCallback, useState } from "react";
import { useNotifications } from "../components/notifications/NotificationProvider";

export function useLocalNotifications() {
  // Server notifications hook
  const {
    activeNotifications,
    dismissNotification: dismissServerNotification,
    clearActiveNotifications,
  } = useNotifications();

  // Local notification state for manual notifications
  const [localNotifications, setLocalNotifications] = useState<any[]>([]);

  // Function to add a local notification
  const addLocalNotification = useCallback(
    (type: string, title: string, message: string) => {
      const notification = {
        type,
        title,
        message,
        timestamp: Date.now(),
        data: {},
      };
      console.log(
        "[useLocalNotifications] Adding local notification:",
        notification
      );
      setLocalNotifications((prev) => {
        const newNotifications = [...prev, notification];
        console.log(
          "[useLocalNotifications] Local notifications after add:",
          newNotifications
        );
        return newNotifications;
      });

      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setLocalNotifications((prev) =>
          prev.filter((n) => n.timestamp !== notification.timestamp)
        );
      }, 5000);
    },
    []
  );

  // Function to dismiss a local notification
  const dismissLocalNotification = useCallback((timestamp: number) => {
    setLocalNotifications((prev) =>
      prev.filter((n) => n.timestamp !== timestamp)
    );
  }, []);

  // Combined dismiss function that handles both server and local notifications
  const dismissNotification = useCallback(
    (timestamp: number) => {
      // Try to dismiss from local notifications first
      const localNotification = localNotifications.find(
        (n) => n.timestamp === timestamp
      );
      if (localNotification) {
        dismissLocalNotification(timestamp);
      } else {
        // If not found in local notifications, try server notifications
        const serverNotification = activeNotifications.find(
          (n) => n.timestamp === timestamp
        );
        if (serverNotification) {
          dismissServerNotification(timestamp);
        }
      }
    },
    [
      localNotifications,
      activeNotifications,
      dismissLocalNotification,
      dismissServerNotification,
    ]
  );

  // Combined clear all function
  const clearAllNotifications = useCallback(() => {
    setLocalNotifications([]);
    clearActiveNotifications();
  }, [clearActiveNotifications]);

  // Combine server notifications with local notifications
  const allNotifications = [...activeNotifications, ...localNotifications];

  return {
    allNotifications,
    addLocalNotification,
    dismissNotification,
    clearAllNotifications,
    localNotifications,
    activeNotifications,
  };
}
