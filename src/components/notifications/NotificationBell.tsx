import { Bell } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/card/Card";
import { Modal } from "@/components/modal/Modal";
import { NOTIFICATION_TYPES } from "@/constants/notification-types";
import type { NotificationPayload } from "@/durable-objects/notification-hub";

interface NotificationBellProps {
	notifications: NotificationPayload[];
	onDismiss: (notificationId: string) => void;
	onDismissAll?: () => void;
	isCollapsed?: boolean;
}

export function NotificationBell({
	notifications,
	onDismiss,
	onDismissAll,
	isCollapsed = false,
}: NotificationBellProps) {
	const [isOpen, setIsOpen] = useState(false);
	// Rendered inside ResourceSidePanel, whose root has backdrop-blur-sm —
	// backdrop-filter creates a new containing block for `position: fixed`
	// descendants, which would trap the modal inside the sidebar instead of
	// the viewport. Portal to <body> (like every other modal in the app,
	// which mount from AppModals.tsx outside that container) to escape it.
	const [mounted, setMounted] = useState(false);
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
			case NOTIFICATION_TYPES.PARTY_ROSTER_UPDATED:
				return "👥";
			case NOTIFICATION_TYPES.PROPOSAL_APPROVED:
				return "✅";
			case NOTIFICATION_TYPES.PROPOSAL_REJECTED:
				return "❌";
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
				return "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700/30 text-green-700 dark:text-green-300";
			case NOTIFICATION_TYPES.FILE_UPLOADED:
				return "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700/30 text-blue-700 dark:text-blue-300";
			case NOTIFICATION_TYPES.CAMPAIGN_CREATED:
				return "bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700/30 text-purple-700 dark:text-purple-400";
			case NOTIFICATION_TYPES.SHARD_APPROVED:
				return "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700/30 text-green-700 dark:text-green-300";
			case NOTIFICATION_TYPES.SHARD_REJECTED:
				return "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700/30 text-red-700 dark:text-red-300";
			case NOTIFICATION_TYPES.CAMPAIGN_FILE_ADDED:
				return "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700/30 text-blue-700 dark:text-blue-300";
			case NOTIFICATION_TYPES.PARTY_ROSTER_UPDATED:
				return "bg-neutral-100 dark:bg-neutral-800/30 border-neutral-300 dark:border-neutral-600/40 text-neutral-700 dark:text-neutral-200";
			case NOTIFICATION_TYPES.PROPOSAL_APPROVED:
				return "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700/30 text-green-700 dark:text-green-300";
			case NOTIFICATION_TYPES.PROPOSAL_REJECTED:
				return "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700/30 text-red-700 dark:text-red-300";
			case NOTIFICATION_TYPES.SUCCESS:
				return "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700/30 text-green-700 dark:text-green-300";
			case NOTIFICATION_TYPES.ERROR:
				return "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700/30 text-red-700 dark:text-red-300";
			default:
				return "bg-neutral-50 dark:bg-neutral-800/20 border-neutral-300 dark:border-neutral-700/30 text-neutral-700 dark:text-neutral-300";
		}
	};

	return (
		<>
			<Card className="tour-notifications p-0 flex flex-col">
				<button
					type="button"
					onClick={() => setIsOpen(true)}
					title={isCollapsed ? "Notifications" : undefined}
					aria-label={isCollapsed ? "Notifications" : undefined}
					className={
						isCollapsed
							? "w-full p-1.5 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
							: "w-full p-2 flex items-center gap-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
					}
				>
					<span className="relative w-8 h-8 flex items-center justify-center shrink-0">
						<Bell
							size={20}
							weight="light"
							className="text-purple-600 dark:text-purple-400"
						/>
						{isCollapsed && notifications.length > 0 && (
							<span
								className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500"
								aria-hidden
							/>
						)}
					</span>
					{!isCollapsed && (
						<>
							<span className="font-medium text-sm">Notifications</span>
							{notifications.length > 0 && (
								<span className="ml-auto h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-medium flex items-center justify-center leading-none shrink-0">
									{notifications.length > 99 ? "99+" : notifications.length}
								</span>
							)}
						</>
					)}
				</button>
			</Card>

			{mounted &&
				createPortal(
					<Modal
						isOpen={isOpen}
						onClose={() => setIsOpen(false)}
						className="modal-size-md"
						options={{ clickOutsideToClose: true }}
					>
						<div className="h-full flex flex-col">
							<div className="flex justify-between items-center gap-4 p-4 pr-12 border-b border-neutral-200 dark:border-neutral-700 flex-shrink-0">
								<h3 className="font-medium text-lg text-neutral-900 dark:text-neutral-100">
									Notifications
								</h3>
								{notifications.length > 0 && onDismissAll && (
									<button
										type="button"
										onClick={onDismissAll}
										className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors shrink-0"
									>
										Clear all
									</button>
								)}
							</div>

							<div className="flex-1 overflow-y-auto">
								{notifications.length === 0 ? (
									<div className="p-8 text-center text-neutral-500 dark:text-neutral-400">
										<p className="text-sm">No notifications</p>
									</div>
								) : (
									<div className="divide-y divide-neutral-200 dark:divide-neutral-700">
										{notifications.map((notification) => (
											<div
												key={`${notification.timestamp}-${notification.title}-${notification.message}`}
												className={`p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors ${getTypeStyles(notification.type)}`}
											>
												<div className="flex items-start space-x-3">
													<div className="flex-shrink-0 text-lg">
														{getIcon(notification.type)}
													</div>

													<div className="flex-1 min-w-0">
														<h4 className="text-sm font-medium mb-1">
															{notification.title}
														</h4>
														<p className="text-sm opacity-90">
															{notification.message}
														</p>
														<p className="text-xs opacity-70 mt-1">
															{new Date(
																notification.timestamp
															).toLocaleTimeString()}
														</p>
													</div>

													<button
														type="button"
														onClick={() =>
															onDismiss(
																`${notification.timestamp}-${notification.title}-${notification.message}`
															)
														}
														className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
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
						</div>
					</Modal>,
					document.body
				)}
		</>
	);
}
