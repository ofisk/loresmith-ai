import { useCallback, useState } from "react";
import { JWT_STORAGE_KEY } from "@/app-constants";
import { useNotifications } from "@/components/notifications/NotificationProvider";
import { API_CONFIG } from "@/shared-config";

/** Server id format is "timestamp:uuid" */
function isServerNotificationId(notificationId: string): boolean {
	return /^\d+:[0-9a-f-]{36}$/i.test(notificationId);
}

export function useLocalNotifications() {
	const {
		activeNotifications,
		dismissNotification: dismissServerNotification,
		clearActiveNotifications,
	} = useNotifications();

	const [localNotifications, setLocalNotifications] = useState<any[]>([]);

	const addLocalNotification = useCallback(
		(type: string, title: string, message: string) => {
			const notification = {
				type,
				title,
				message,
				timestamp: Date.now(),
				data: {},
			};
			setLocalNotifications((prev) => [...prev, notification]);
		},
		[]
	);

	const dismissLocalNotification = useCallback((timestamp: number) => {
		setLocalNotifications((prev) =>
			prev.filter((n) => n.timestamp !== timestamp)
		);
	}, []);

	const dismissNotification = useCallback(
		async (notificationId: string) => {
			// Server notification (has id from DO history)
			if (isServerNotificationId(notificationId)) {
				const token = localStorage.getItem(JWT_STORAGE_KEY);
				if (token) {
					try {
						await fetch(
							API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.NOTIFICATIONS.DISMISS),
							{
								method: "POST",
								headers: {
									Authorization: `Bearer ${token}`,
									"Content-Type": "application/json",
								},
								body: JSON.stringify({ id: notificationId }),
							}
						);
					} catch (_e) {
						// Best-effort; still remove from UI
					}
				}
				dismissServerNotification(notificationId);
				return;
			}
			// Local or legacy: "timestamp-index"
			const parts = notificationId.split("-");
			const ts = parseInt(parts[0], 10);
			if (Number.isNaN(ts)) return;
			const local = localNotifications.find((n) => n.timestamp === ts);
			if (local) {
				dismissLocalNotification(ts);
			} else {
				const server = activeNotifications.find(
					(n) => n.timestamp === ts || n.id === notificationId
				);
				if (server) {
					if (server.id) {
						const token = localStorage.getItem(JWT_STORAGE_KEY);
						if (token) {
							try {
								await fetch(
									API_CONFIG.buildUrl(
										API_CONFIG.ENDPOINTS.NOTIFICATIONS.DISMISS
									),
									{
										method: "POST",
										headers: {
											Authorization: `Bearer ${token}`,
											"Content-Type": "application/json",
										},
										body: JSON.stringify({ id: server.id }),
									}
								);
							} catch (_e) {}
						}
					}
					dismissServerNotification(server.id ?? ts);
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

	const clearAllNotifications = useCallback(async () => {
		const token = localStorage.getItem(JWT_STORAGE_KEY);
		if (token) {
			try {
				await fetch(
					API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.NOTIFICATIONS.CLEAR),
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${token}`,
							"Content-Type": "application/json",
						},
					}
				);
			} catch (_e) {
				// Best-effort
			}
		}
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
