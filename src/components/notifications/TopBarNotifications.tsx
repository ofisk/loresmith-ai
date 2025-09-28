import { NotificationBell } from "./NotificationBell";

interface TopBarNotificationsProps {
  notifications: any[];
  onDismiss: (timestamp: number) => void;
  onDismissAll: () => void;
}

export function TopBarNotifications({
  notifications,
  onDismiss,
  onDismissAll,
}: TopBarNotificationsProps) {
  return (
    <div className="ml-1">
      <NotificationBell
        notifications={notifications}
        onDismiss={(notificationId) => {
          const ts = parseInt(notificationId.split("-")[0], 10);
          onDismiss(ts);
        }}
        onDismissAll={onDismissAll}
      />
    </div>
  );
}
