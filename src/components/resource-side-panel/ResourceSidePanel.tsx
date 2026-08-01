import {
	CaretDown,
	CreditCard,
	EnvelopeSimple,
	SignOut,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/app/AppHeader";
import { TopBarNotifications } from "@/components/notifications/TopBarNotifications";
import { useAppShellContextOptional } from "@/contexts/AppShellContext";
import { useCampaignManagement } from "@/hooks/useCampaignManagement";
import { useDismissibleLayer } from "@/hooks/useDismissibleLayer";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";
import { useResourceSidePanelState } from "@/hooks/useResourceSidePanelState";
import { AuthService } from "@/services/core/auth-service";
import type { Campaign } from "@/types/campaign";
import { CampaignsSection } from "./CampaignsSection";
import { LibrarySection } from "./LibrarySection";
import { ShardsSection } from "./ShardsSection";
import { TelemetrySection } from "./TelemetrySection";

interface ResourceSidePanelProps {
	className?: string;
	/** Used when rendered outside AppShellProvider (e.g. tests) */
	isAuthenticated?: boolean;
	campaigns?: Campaign[];
	selectedCampaignId?: string;
	onLogout?: () => Promise<void>;
	showUserMenu?: boolean;
	setShowUserMenu?: (show: boolean) => void;
	triggerFileUpload?: boolean;
	onFileUploadTriggered?: () => void;
	onCreateCampaign?: () => void;
	onCampaignClick?: (campaign: Campaign) => void;
	onAddResource?: (initialFiles?: File[]) => void;
	onAddToCampaign?: (file: ResourceFileWithCampaigns) => void;
	onEditFile?: (file: ResourceFileWithCampaigns) => void;
	campaignAdditionProgress?: Record<string, number>;
	isAddingToCampaigns?: boolean;
	addLocalNotification?: (type: string, title: string, message: string) => void;
	onShowUsageLimits?: () => void;
	/** Header controls (used when rendered outside AppShellProvider, e.g. tests) */
	onSessionRecapRequest?: () => void;
	onAdminDashboardOpen?: () => void;
}

export function ResourceSidePanel(props: ResourceSidePanelProps) {
	const { className = "" } = props;
	const ctx = useAppShellContextOptional();
	const {
		isAuthenticated,
		campaigns,
		onLogout,
		showUserMenu,
		setShowUserMenu,
		triggerFileUpload,
		onFileUploadTriggered,
		onCreateCampaign,
		onCampaignClick,
		onAddResource,
		onAddToCampaign,
		onEditFile,
		campaignAdditionProgress,
		isAddingToCampaigns,
		addLocalNotification,
		onShowUsageLimits,
		onSessionRecapRequest,
		onAdminDashboardOpen,
		selectedCampaignId,
		billingTier,
		notifications,
		dismissNotification,
		clearAllNotifications,
		canReviewShards,
		visibleShardGroups,
		shardsLoading,
		onShardsProcessed,
		getStoredJwt,
		onShardRefresh,
	} = useResourceSidePanelState(ctx, props);
	const noop = useCallback(() => {}, []);
	const isAdmin = AuthService.getJwtPayload()?.isAdmin === true;
	const [isLibraryOpen, setIsLibraryOpen] = useState(false);
	const [isCampaignsOpen, setIsCampaignsOpen] = useState(false);

	const closeUserMenu = useCallback(() => {
		setShowUserMenu?.(false);
	}, [setShowUserMenu]);

	useDismissibleLayer({
		open: showUserMenu,
		onClose: closeUserMenu,
		enabled: Boolean(setShowUserMenu),
	});

	const handleCampaignsToggle = useCallback(() => {
		setIsCampaignsOpen((prev) => !prev);
	}, []);
	const handleLibraryToggle = useCallback(() => {
		setIsLibraryOpen((prev) => !prev);
	}, []);

	const {
		campaigns: managedCampaigns,
		campaignsLoading,
		campaignsError,
	} = useCampaignManagement({
		_isAuthenticated: isAuthenticated,
		campaigns, // Pass campaigns from parent
	});

	// Open campaigns section by default when no campaigns exist (empty state onboarding)
	useEffect(() => {
		if (!campaignsLoading && managedCampaigns.length === 0) {
			setIsCampaignsOpen(true);
		}
	}, [campaignsLoading, managedCampaigns.length]);

	// Watch for external trigger to open file upload modal
	useEffect(() => {
		if (triggerFileUpload) {
			onAddResource?.();
			onFileUploadTriggered?.();
		}
	}, [triggerFileUpload, onAddResource, onFileUploadTriggered]);

	const handleLogout = async () => {
		if (!window.confirm("Are you sure you want to log out?")) return;
		try {
			await onLogout?.();
		} catch (_error) {}
	};

	return (
		<div
			className={`tour-sidebar w-full md:w-80 h-full bg-neutral-50/80 dark:bg-neutral-900/80 border-r border-neutral-200 dark:border-neutral-700 flex flex-col backdrop-blur-sm ${className}`}
		>
			<AppHeader
				onSessionRecapRequest={onSessionRecapRequest}
				selectedCampaignId={selectedCampaignId}
			/>

			{/* Content - scrollable pane so both sections are reachable */}
			<div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
				<div className="flex flex-col gap-3 p-4">
					{/* Campaigns Section */}
					<div className="flex-shrink-0">
						<CampaignsSection
							campaigns={managedCampaigns}
							campaignsLoading={campaignsLoading}
							campaignsError={campaignsError}
							onToggle={handleCampaignsToggle}
							isOpen={isCampaignsOpen}
							onCreateCampaign={onCreateCampaign ?? noop}
							onCampaignClick={onCampaignClick ?? noop}
						/>
					</div>

					{/* Library Section */}
					<div className="flex-shrink-0">
						<LibrarySection
							isOpen={isLibraryOpen}
							onToggle={handleLibraryToggle}
							onAddToLibrary={onAddResource ?? noop}
							onAddToCampaign={onAddToCampaign ?? noop}
							onEditFile={onEditFile ?? noop}
							campaigns={campaigns}
							campaignAdditionProgress={campaignAdditionProgress}
							isAddingToCampaigns={isAddingToCampaigns}
							addLocalNotification={addLocalNotification}
							onShowUsageLimits={onShowUsageLimits}
						/>
					</div>

					{/* Notifications */}
					<div className="flex-shrink-0">
						<TopBarNotifications
							notifications={notifications}
							onDismiss={dismissNotification}
							onDismissAll={clearAllNotifications}
						/>
					</div>

					{/* Pending shards (players/GMs with review access) */}
					{canReviewShards && (
						<div className="flex-shrink-0">
							<ShardsSection
								shards={visibleShardGroups}
								isLoading={shardsLoading}
								onShardsProcessed={onShardsProcessed}
								getJwt={getStoredJwt}
								onRefresh={onShardRefresh}
							/>
						</div>
					)}

					{/* Telemetry (admin only) */}
					{isAdmin && onAdminDashboardOpen && (
						<div className="flex-shrink-0">
							<TelemetrySection onOpen={onAdminDashboardOpen} />
						</div>
					)}
				</div>
			</div>

			{/* Username Display and Menu - At the very bottom */}
			{isAuthenticated && (
				<div className="flex-shrink-0 p-4">
					<div className="relative user-menu-container tour-user-menu">
						<button
							type="button"
							onClick={() => setShowUserMenu?.(!showUserMenu)}
							aria-expanded={showUserMenu}
							aria-haspopup="menu"
							className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-md transition-colors w-full"
						>
							<span className="w-2 h-2 bg-purple-500 rounded-full shrink-0"></span>
							<span className="truncate">
								{AuthService.getUsernameFromStoredJwt()}
							</span>
							{billingTier && (
								<span
									className="h-5 px-1.5 rounded-full text-[10px] font-medium capitalize bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 inline-flex items-center cursor-default shrink-0"
									title="Subscription tier"
								>
									{billingTier}
								</span>
							)}
							<CaretDown
								size={16}
								className="transition-transform duration-200 ml-auto"
								aria-hidden="true"
							/>
						</button>

						{/* Dropdown Menu */}
						{showUserMenu && (
							<div className="absolute bottom-full left-0 mb-2 w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-lg z-50">
								<div className="py-1">
									<a
										href="/billing"
										className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex items-center gap-2"
									>
										<CreditCard size={16} />
										Billing
									</a>
									<a
										href="mailto:support@loresmith.ai"
										className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex items-center gap-2"
									>
										<EnvelopeSimple size={16} />
										Contact support
									</a>
									<button
										type="button"
										onClick={handleLogout}
										className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors flex items-center gap-2 mt-1 border-t border-neutral-200 dark:border-neutral-700"
									>
										<SignOut size={16} />
										Logout
									</button>
								</div>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
