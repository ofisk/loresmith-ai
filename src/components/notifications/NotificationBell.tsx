import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../button/Button";
import { NOTIFICATION_TYPES } from "../../constants/notification-types";
import type { NotificationPayload } from "../../durable-objects/notification-hub";

interface NotificationBellProps {
  notifications: NotificationPayload[];
  onDismiss: (notificationId: string) => void;
  onDismissAll?: () => void;
}

export function NotificationBell({
  notifications,
  onDismiss,
  onDismissAll,
}: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null); // wraps the bell button
  const panelRef = useRef<HTMLDivElement>(null); // wraps the portal panel
  const [mounted, setMounted] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideTrigger = dropdownRef.current?.contains(target);
      const clickedInsidePanel = panelRef.current?.contains(target);
      if (!clickedInsideTrigger && !clickedInsidePanel) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Ensure document is available for portal
  useEffect(() => setMounted(true), []);

  const getIcon = (type: string) => {
    switch (type) {
      case NOTIFICATION_TYPES.SHARDS_GENERATED:
        return "🎉";
      case NOTIFICATION_TYPES.FILE_UPLOADED:
        return "✅";
      case NOTIFICATION_TYPES.CAMPAIGN_CREATED:
        return "🎯";
      case NOTIFICATION_TYPES.SHARD_APPROVED:
        return "✅";
      case NOTIFICATION_TYPES.SHARD_REJECTED:
        return "❌";
      case NOTIFICATION_TYPES.CAMPAIGN_FILE_ADDED:
        return "📁";
      case NOTIFICATION_TYPES.SUCCESS:
        return "✅";
      case NOTIFICATION_TYPES.ERROR:
        return "❌";
      default:
        return "📢";
    }
  };

  const getTypeStyles = (type: string) => {
    switch (type) {
      case NOTIFICATION_TYPES.SHARDS_GENERATED:
        return "bg-green-900/20 border-green-700/30 text-green-300";
      case NOTIFICATION_TYPES.FILE_UPLOADED:
        return "bg-blue-900/20 border-blue-700/30 text-blue-300";
      case NOTIFICATION_TYPES.CAMPAIGN_CREATED:
        return "bg-purple-900/20 border-purple-700/30 text-purple-400";
      case NOTIFICATION_TYPES.SHARD_APPROVED:
        return "bg-green-900/20 border-green-700/30 text-green-300";
      case NOTIFICATION_TYPES.SHARD_REJECTED:
        return "bg-red-900/20 border-red-700/30 text-red-300";
      case NOTIFICATION_TYPES.CAMPAIGN_FILE_ADDED:
        return "bg-blue-900/20 border-blue-700/30 text-blue-300";
      case NOTIFICATION_TYPES.SUCCESS:
        return "bg-green-900/20 border-green-700/30 text-green-300";
      case NOTIFICATION_TYPES.ERROR:
        return "bg-red-900/20 border-red-700/30 text-red-300";
      default:
        return "bg-gray-800/20 border-gray-700/30 text-gray-300";
    }
  };

  return (
    <div className="relative tour-notifications" ref={dropdownRef}>
      <Button
        variant="secondary"
        size="md"
        shape="circular"
        className="!h-9 !w-9 flex items-center justify-center relative"
        aria-label="Notifications"
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <title>Notifications</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-5 5v-5zM4.5 19.5a2.5 2.5 0 01-2.5-2.5V7a2.5 2.5 0 012.5-2.5h15a2.5 2.5 0 012.5 2.5v10a2.5 2.5 0 01-2.5 2.5h-15z"
          />
        </svg>
        {notifications.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-medium leading-none">
            {notifications.length > 99 ? "99+" : notifications.length}
          </span>
        )}
      </Button>

      {isOpen &&
        mounted &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed top-16 right-4 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-[2147483647] max-h-96 overflow-hidden"
          >
            <div className="p-3 border-b border-gray-700 bg-gray-800">
              <div className="flex justify-between items-center">
                <h3 className="font-medium text-gray-100">Notifications</h3>
                {notifications.length > 0 && onDismissAll && (
                  <button
                    type="button"
                    onClick={onDismissAll}
                    className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-gray-400">
                  <p className="text-sm">No notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-700">
                  {notifications.map((notification, index) => (
                    <div
                      key={`${notification.timestamp}-${index}`}
                      className={`p-3 hover:bg-neutral-800/50 dark:hover:bg-neutral-800/50 transition-colors ${getTypeStyles(notification.type)}`}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 text-lg">
                          {getIcon(notification.type)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium mb-1 text-gray-100">
                            {notification.title}
                          </h4>
                          <p className="text-sm opacity-90 text-gray-300">
                            {notification.message}
                          </p>
                          <p className="text-xs opacity-70 mt-1 text-gray-400">
                            {new Date(
                              notification.timestamp
                            ).toLocaleTimeString()}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            onDismiss(`${notification.timestamp}-${index}`)
                          }
                          className="flex-shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
                          aria-label="Dismiss notification"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <title>Dismiss</title>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
