import { NotificationBell } from "./NotificationBell";

interface TopBarNotificationsProps {
	notifications: any[];
	onDismiss: (notificationId: string) => void;
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
				onDismiss={onDismiss}
				onDismissAll={onDismissAll}
			/>
		</div>
	);
}
