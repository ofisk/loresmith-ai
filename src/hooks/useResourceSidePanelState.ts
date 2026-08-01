import { useCallback } from "react";
import type { AppShellContextValue } from "@/contexts/AppShellContext";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";
import type { Campaign } from "@/types/campaign";

export interface ResourceSidePanelStateProps {
	isAuthenticated?: boolean;
	campaigns?: Campaign[];
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
	selectedCampaignId?: string;
	onSessionRecapRequest?: () => void;
	onAdminDashboardOpen?: () => void;
}

interface NotificationEntry {
	timestamp: number;
	type: string;
	title: string;
	message: string;
	data?: Record<string, unknown>;
}

function withFallbackMessage(
	n: AppShellContextValue["allNotifications"][number]
) {
	return { ...n, message: n.message ?? "" };
}

function resolveFromContext(ctx: AppShellContextValue) {
	return {
		isAuthenticated: ctx.authState.isAuthenticated,
		campaigns: ctx.campaigns,
		onLogout: ctx.handleLogout,
		showUserMenu: ctx.authState.showUserMenu,
		setShowUserMenu: ctx.authState.setShowUserMenu,
		triggerFileUpload: ctx.triggerFileUpload,
		onFileUploadTriggered: ctx.handleFileUploadTriggered,
		onCreateCampaign: ctx.modalState.handleCreateCampaign,
		onCampaignClick: ctx.modalState.handleCampaignClick,
		onAddResource: ctx.onAddResource,
		onAddToCampaign: ctx.onAddToCampaign,
		onEditFile: ctx.onEditFile,
		campaignAdditionProgress: ctx.campaignAdditionProgress,
		isAddingToCampaigns: ctx.isAddingToCampaigns,
		addLocalNotification: ctx.addLocalNotification,
		onShowUsageLimits: ctx.onShowUsageLimits,
		onSessionRecapRequest: ctx.handleSessionRecapRequest,
		onAdminDashboardOpen: ctx.modalState.handleAdminDashboardOpen,
		selectedCampaignId: ctx.selectedCampaignId ?? null,
		billingTier: ctx.billingStatus?.tier ?? null,
		notifications: ctx.allNotifications.map(withFallbackMessage),
		dismissNotification: ctx.dismissNotification,
		clearAllNotifications: ctx.clearAllNotifications,
		canReviewShards: ctx.canReviewShards,
		visibleShardGroups: ctx.visibleShardGroups,
		shardsLoading: ctx.shardsLoading,
		onShardsProcessed: ctx.onShardsProcessed,
		getStoredJwt: ctx.authState.getStoredJwt,
		onShardRefresh: ctx.onShardRefresh,
	};
}

function resolveFromProps(
	props: ResourceSidePanelStateProps,
	noop: () => void
) {
	const notifications: NotificationEntry[] = [];
	const visibleShardGroups: AppShellContextValue["visibleShardGroups"] = [];
	return {
		isAuthenticated: props.isAuthenticated ?? false,
		campaigns: props.campaigns ?? [],
		onLogout: props.onLogout,
		showUserMenu: props.showUserMenu ?? false,
		setShowUserMenu: props.setShowUserMenu,
		triggerFileUpload: props.triggerFileUpload ?? false,
		onFileUploadTriggered: props.onFileUploadTriggered,
		onCreateCampaign: props.onCreateCampaign,
		onCampaignClick: props.onCampaignClick,
		onAddResource: props.onAddResource,
		onAddToCampaign: props.onAddToCampaign,
		onEditFile: props.onEditFile,
		campaignAdditionProgress: props.campaignAdditionProgress ?? {},
		isAddingToCampaigns: props.isAddingToCampaigns ?? false,
		addLocalNotification: props.addLocalNotification,
		onShowUsageLimits: props.onShowUsageLimits,
		onSessionRecapRequest: props.onSessionRecapRequest,
		onAdminDashboardOpen: props.onAdminDashboardOpen,
		selectedCampaignId: props.selectedCampaignId ?? null,
		billingTier: null,
		notifications,
		dismissNotification: noop,
		clearAllNotifications: noop,
		canReviewShards: false,
		visibleShardGroups,
		shardsLoading: false,
		onShardsProcessed: noop,
		getStoredJwt: () => null,
		onShardRefresh: noop,
	};
}

/**
 * Resolves ResourceSidePanel's inputs: prefer AppShellContext when the panel
 * is rendered inside the provider, otherwise fall back to the given props
 * (used when rendered standalone, e.g. in tests/stories).
 */
export function useResourceSidePanelState(
	ctx: AppShellContextValue | null,
	props: ResourceSidePanelStateProps
) {
	const noop = useCallback(() => {}, []);
	return ctx ? resolveFromContext(ctx) : resolveFromProps(props, noop);
}
