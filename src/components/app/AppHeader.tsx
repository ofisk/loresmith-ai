import {
	ChartBar,
	EnvelopeSimple,
	Lightbulb,
	List,
	NotePencil,
} from "@phosphor-icons/react";
import loresmith from "@/assets/loresmith.png";
import { Button } from "@/components/button/Button";
import { HelpButton } from "@/components/help/HelpButton";
import { TopBarNotifications } from "@/components/notifications/TopBarNotifications";
import { PLAYER_ROLES } from "@/constants/campaign-roles";
import type { NotificationPayload } from "@/durable-objects/notification-hub";
import { AuthService } from "@/services/core/auth-service";
import type { CampaignRole } from "@/types/campaign";

interface AppHeaderProps {
	onToggleSidebar?: () => void;
	isSidebarOpen?: boolean;
	onClearHistory?: () => void;
	onHelpAction: (action: string) => void;
	onSessionRecapRequest?: () => void;
	onNextStepsRequest?: () => void;
	notifications: (
		| NotificationPayload
		| {
				timestamp: number;
				type: string;
				title: string;
				message: string;
				data?: Record<string, unknown>;
		  }
	)[];
	onDismissNotification: (timestamp: number) => void;
	onClearAllNotifications: () => void;
	selectedCampaignId: string | null;
	onAdminDashboardOpen?: () => void;
	selectedCampaignRole?: CampaignRole | null;
	billingTier?: "free" | "basic" | "pro" | null;
}

/**
 * AppHeader component - Top navigation bar with logo, controls, and notifications
 */
export function AppHeader({
	onToggleSidebar,
	isSidebarOpen = false,
	onHelpAction,
	onSessionRecapRequest,
	onNextStepsRequest,
	notifications,
	onDismissNotification,
	onClearAllNotifications,
	selectedCampaignId,
	onAdminDashboardOpen,
	selectedCampaignRole = null,
	billingTier = null,
}: AppHeaderProps) {
	// Check if user is admin
	const payload = AuthService.getJwtPayload();
	const isAdmin = payload?.isAdmin === true;
	const isPlayerRole =
		selectedCampaignRole !== null && PLAYER_ROLES.has(selectedCampaignRole);

	return (
		<div className="app-header px-4 py-2 border-b border-neutral-200/50 dark:border-neutral-700/50 flex items-center gap-3 bg-white/60 dark:bg-neutral-950/60 backdrop-blur-sm rounded-t-2xl">
			{onToggleSidebar && (
				<Button
					variant="ghost"
					size="md"
					shape="square"
					className="md:hidden !h-8 !w-8 rounded-full flex items-center justify-center"
					onClick={onToggleSidebar}
					tooltip={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
					aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
				>
					<List size={18} />
				</Button>
			)}

			<div
				className="hidden md:flex items-center justify-center"
				style={{ width: 32, height: 32 }}
			>
				<img
					src={loresmith}
					alt="LoreSmith logo"
					width={32}
					height={32}
					className="object-contain"
				/>
			</div>

			<div className="flex-1 flex items-center gap-3 min-w-0">
				<h1 className="hidden md:block font-medium text-lg whitespace-nowrap text-neutral-700 dark:text-neutral-300">
					LoreSmith
				</h1>
			</div>

			{onSessionRecapRequest && (
				<Button
					variant="ghost"
					size="md"
					shape="square"
					className="tour-session-recap !h-8 !w-8 rounded-full flex items-center justify-center"
					onClick={onSessionRecapRequest}
					disabled={!selectedCampaignId}
					tooltip={
						selectedCampaignId
							? "Record session recap"
							: "Select a campaign to record a session recap"
					}
				>
					<NotePencil size={18} />
				</Button>
			)}

			{onNextStepsRequest && (
				<Button
					variant="ghost"
					size="md"
					shape="square"
					className="tour-next-steps !h-8 !w-8 rounded-full flex items-center justify-center"
					onClick={onNextStepsRequest}
					disabled={!selectedCampaignId}
					tooltip={
						!selectedCampaignId
							? "Select a campaign to get next-step suggestions"
							: isPlayerRole
								? "What should I do next as a player?"
								: "What should I do next?"
					}
				>
					<Lightbulb size={18} />
				</Button>
			)}

			<HelpButton onActionClick={onHelpAction} />

			{billingTier && (
				<Button
					as="a"
					href="/billing"
					variant="ghost"
					size="md"
					className="!h-8 px-2 rounded-full text-xs font-medium capitalize bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
					tooltip="View billing and subscription"
				>
					{billingTier}
				</Button>
			)}

			<Button
				as="a"
				href="mailto:support@loresmith.ai"
				variant="ghost"
				size="md"
				shape="square"
				className="!h-8 !w-8 rounded-full flex items-center justify-center"
				tooltip="Contact support"
				aria-label="Contact support"
			>
				<EnvelopeSimple size={18} />
			</Button>

			{isAdmin && onAdminDashboardOpen && (
				<Button
					variant="ghost"
					size="md"
					shape="square"
					className="tour-admin-dashboard !h-8 !w-8 rounded-full flex items-center justify-center"
					onClick={onAdminDashboardOpen}
					tooltip="Admin dashboard - view telemetry and metrics"
				>
					<ChartBar size={18} />
				</Button>
			)}

			<TopBarNotifications
				notifications={notifications}
				onDismiss={onDismissNotification}
				onDismissAll={onClearAllNotifications}
			/>
		</div>
	);
}
