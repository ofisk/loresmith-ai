import type React from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { CONTEXT_RECAP_PLACEHOLDER } from "@/app-constants";
import { PLAYER_ROLES } from "@/constants/campaign-roles";
import { useAppEventHandlers } from "@/hooks/useAppEventHandlers";
import { useAppOrchestration } from "@/hooks/useAppOrchestration";
import { useChatSession } from "@/hooks/useChatSession";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";
import { useTourState } from "@/hooks/useTourState";
import { useUiHints } from "@/hooks/useUiHints";
import { AuthService } from "@/services/core/auth-service";
import type { Message } from "@/types/ai-message";
import type { Campaign } from "@/types/campaign";
import type { StagedShardGroup } from "@/types/shard";

export interface AppShellContextValue {
	// Routing
	showBillingPage: boolean;
	joinToken: string | null;

	// Tour
	runTour: boolean;
	stepIndex: number;
	tourSteps: Array<{
		target: string;
		content: React.ReactNode;
		placement?: "center" | "top" | "bottom" | "left" | "right";
		disableBeacon?: boolean;
		locale?: { next?: string };
	}>;
	onJoyrideCallback: (data: {
		action?: string;
		index?: number;
		status?: string;
		type?: string;
		lifecycle?: string;
	}) => void;

	// Layout
	onToggleSidebar: () => void;
	isSidebarOpen: boolean;

	// Modal / auth
	modalState: ReturnType<typeof useAppOrchestration>["modalState"];
	authState: ReturnType<typeof useAppOrchestration>["authState"];
	handleLogout: () => Promise<void>;
	handleJoinSuccess: (campaignId: string) => void;

	// Campaigns
	campaigns: Campaign[];
	selectedCampaignId: string | null;
	selectedCampaign: Campaign | null;
	onSelectedCampaignChange: (campaignId: string | null) => void;
	createCampaign: (name: string, description?: string) => Promise<Campaign>;
	refetchCampaigns: () => Promise<Campaign[]>;

	// Billing
	billingStatus: ReturnType<typeof useAppOrchestration>["billingStatus"];

	// Notifications
	allNotifications: ReturnType<typeof useAppOrchestration>["allNotifications"];
	dismissNotification: (timestamp: number) => void;
	clearAllNotifications: () => void;
	addLocalNotification: (type: string, title: string, message: string) => void;

	// Resource / file
	onAddResource: () => void;
	onAddToCampaign: (file: ResourceFileWithCampaigns) => void;
	addFileToCampaigns: ReturnType<
		typeof useAppOrchestration
	>["addFileToCampaigns"];
	onEditFile: (file: ResourceFileWithCampaigns) => void;
	campaignAdditionProgress: Record<string, number>;
	isAddingToCampaigns: boolean;
	onShowUsageLimits: () => void;

	// Chat
	chatContainerId: string;
	messages: Message[];
	chatHistoryLoaded: boolean;
	input: string;
	onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
	onFormSubmit: (e: React.FormEvent) => void;
	onKeyDown: (e: React.KeyboardEvent) => void;
	isLoading: boolean;
	onStop: () => void;
	formatTime: (date: Date) => string;
	agentStatus: string | null;
	onSuggestionSubmit: (suggestion: string) => void;
	onUploadFiles: () => void;
	textareaHeight: string;
	setTextareaHeight: (height: string) => void;
	pendingToolCallConfirmation: boolean;
	invisibleUserContents: Set<string>;
	invisibleUserContentsVersion: number;
	handleHelpAction: (action: string) => void;
	handleSessionRecapRequest?: () => void;
	handleNextStepsRequest: () => void;

	// Shard overlay
	canReviewShards: boolean;
	visibleShardGroups: StagedShardGroup[];
	shardsLoading: boolean;
	onShardsProcessed: (shardIds: string[]) => void;
	onShardRefresh: () => void;

	// Proposals
	onProposalConfirm: () => void;
	onProposalCancel: () => void;

	// Upload
	handleUpload: ReturnType<typeof useAppOrchestration>["handleUpload"];
	handleFileUpdate: ReturnType<typeof useAppOrchestration>["handleFileUpdate"];
	handleFileUploadTriggered: () => void;
	triggerFileUpload: boolean;
	setTriggerFileUpload: (value: boolean) => void;

	// Misc
	authReady: boolean;
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function useAppShellContext(): AppShellContextValue {
	const ctx = useContext(AppShellContext);
	if (!ctx) {
		throw new Error("useAppShellContext must be used within AppShellProvider");
	}
	return ctx;
}

export function useAppShellContextOptional(): AppShellContextValue | null {
	return useContext(AppShellContext);
}

interface AppShellProviderProps {
	children: React.ReactNode;
}

export function AppShellProvider({ children }: AppShellProviderProps) {
	const orchestration = useAppOrchestration();
	const {
		modalState,
		authState,
		chatContainerId,
		textareaHeight,
		setTextareaHeight,
		triggerFileUpload,
		setTriggerFileUpload,
		createCampaign,
		campaigns,
		selectedCampaignId,
		selectedCampaign,
		setSelectedCampaignId,
		refetchCampaigns,
		joinToken,
		showBillingPage,
		billingStatus,
		handleLogout,
		handleJoinSuccess,
		isMobileSidebarOpen,
		setIsMobileSidebarOpen,
		allNotifications,
		dismissNotification,
		clearAllNotifications,
		addLocalNotification,
		onProposalConfirm,
		onProposalCancel,
		campaignAdditionProgress,
		isAddingToCampaigns,
		addFileToCampaigns,
		handleUpload,
		handleFileUploadTriggered,
		handleFileUpdate,
		checkShouldShowRecap,
		markRecapShown,
		checkHasBeenAway,
		updateActivity,
		authReady,
		visibleShardGroups,
		canReviewShards,
		shardsLoading,
		removeProcessedShards,
		fetchAllStagedShards,
		shardsReadyRefetchTimeoutRef,
	} = orchestration;

	const tour = useTourState({ authState });

	const username = AuthService.getJwtPayload()?.username ?? null;
	const conversationId =
		username !== null
			? `${username}-campaign-${selectedCampaignId ?? "none"}`
			: "auth-required";

	const chatSession = useChatSession({
		conversationId,
		authState,
		modalState: {
			setShowAuthModal: modalState.setShowAuthModal,
			showRateLimitReachedModal: modalState.showRateLimitReachedModal,
			handleUsageLimitsOpen: modalState.handleUsageLimitsOpen,
		},
		selectedCampaignId,
		selectedCampaign,
		chatContainerId,
		setTextareaHeight,
		addLocalNotification: (type, title, message?) =>
			addLocalNotification(type, title, message ?? ""),
		updateActivity,
		authReady,
	});

	const {
		messages,
		isLoading,
		agentStatus,
		input,
		handleAgentInputChange,
		handleFormSubmit,
		handleKeyDown,
		handleSuggestionSubmit,
		handleHelpAction,
		handleSessionRecapRequest,
		handleNextStepsRequest,
		stop,
		pendingToolCallConfirmation,
		formatTime,
		chatHistoryLoaded,
		invisibleUserContentsRef,
		invisibleUserContentsVersion,
		addToInvisible,
		append,
	} = chatSession;

	useAppEventHandlers({
		modalState,
		refetchCampaigns,
		fetchAllStagedShards,
		authReady,
		selectedCampaignId,
		isLoading,
		checkHasBeenAway,
		checkShouldShowRecap,
		markRecapShown,
		append,
		authState,
		onContextRecapRequest: () => addToInvisible(CONTEXT_RECAP_PLACEHOLDER),
	});

	useUiHints({
		onUiHint: async ({ type, data }) => {
			if (
				type === "shards_ready" &&
				data &&
				typeof data === "object" &&
				"campaignId" in data &&
				typeof data.campaignId === "string"
			) {
				if (shardsReadyRefetchTimeoutRef.current) {
					clearTimeout(shardsReadyRefetchTimeoutRef.current);
				}
				shardsReadyRefetchTimeoutRef.current = setTimeout(() => {
					shardsReadyRefetchTimeoutRef.current = null;
					fetchAllStagedShards();
				}, 800);
			}
		},
	});

	const handleChatInputChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			handleAgentInputChange(e);
			const target = e.target as HTMLTextAreaElement;
			requestAnimationFrame(() => {
				target.style.height = "auto";
				const maxHeightPx = Math.min(window.innerHeight * 0.25, 400);
				const newHeight = Math.min(
					maxHeightPx,
					Math.max(40, target.scrollHeight)
				);
				target.style.height = `${newHeight}px`;
				setTextareaHeight(`${newHeight}px`);
			});
		},
		[handleAgentInputChange, setTextareaHeight]
	);

	const onToggleSidebar = useCallback(
		() => setIsMobileSidebarOpen((p) => !p),
		[]
	);
	const onUploadFiles = useCallback(
		() => setTriggerFileUpload(true),
		[setTriggerFileUpload]
	);

	const value = useMemo<AppShellContextValue>(
		() => ({
			showBillingPage,
			joinToken,
			runTour: tour.runTour,
			stepIndex: tour.stepIndex,
			tourSteps: tour.steps,
			onJoyrideCallback: tour.handleJoyrideCallback,
			onToggleSidebar,
			isSidebarOpen: isMobileSidebarOpen,
			modalState,
			authState,
			handleLogout,
			handleJoinSuccess,
			campaigns,
			selectedCampaignId,
			selectedCampaign,
			onSelectedCampaignChange: setSelectedCampaignId,
			createCampaign,
			refetchCampaigns,
			billingStatus,
			allNotifications,
			dismissNotification,
			clearAllNotifications,
			addLocalNotification,
			onAddResource: modalState.handleAddResource,
			onAddToCampaign: modalState.handleAddToCampaign,
			addFileToCampaigns,
			onEditFile: modalState.handleEditFile,
			campaignAdditionProgress,
			isAddingToCampaigns,
			onShowUsageLimits: modalState.handleUsageLimitsOpen,
			chatContainerId,
			messages,
			chatHistoryLoaded,
			input: input ?? "",
			onInputChange: handleChatInputChange,
			onFormSubmit: handleFormSubmit,
			onKeyDown: handleKeyDown,
			isLoading,
			onStop: stop,
			formatTime,
			agentStatus,
			onSuggestionSubmit: handleSuggestionSubmit,
			onUploadFiles,
			textareaHeight,
			setTextareaHeight,
			pendingToolCallConfirmation,
			invisibleUserContents: invisibleUserContentsRef.current,
			invisibleUserContentsVersion,
			handleHelpAction,
			handleSessionRecapRequest:
				selectedCampaign?.role && !PLAYER_ROLES.has(selectedCampaign.role)
					? handleSessionRecapRequest
					: undefined,
			handleNextStepsRequest,
			canReviewShards: canReviewShards ?? false,
			visibleShardGroups,
			shardsLoading,
			onShardsProcessed: removeProcessedShards,
			onShardRefresh: fetchAllStagedShards,
			onProposalConfirm,
			onProposalCancel,
			handleUpload,
			handleFileUpdate,
			handleFileUploadTriggered,
			triggerFileUpload,
			setTriggerFileUpload,
			authReady,
		}),
		[
			showBillingPage,
			joinToken,
			tour.runTour,
			tour.stepIndex,
			tour.steps,
			tour.handleJoyrideCallback,
			onToggleSidebar,
			isMobileSidebarOpen,
			modalState,
			authState,
			handleLogout,
			handleJoinSuccess,
			campaigns,
			selectedCampaignId,
			selectedCampaign,
			setSelectedCampaignId,
			createCampaign,
			refetchCampaigns,
			billingStatus,
			allNotifications,
			dismissNotification,
			clearAllNotifications,
			addLocalNotification,
			modalState.handleAddResource,
			modalState.handleAddToCampaign,
			addFileToCampaigns,
			modalState.handleEditFile,
			campaignAdditionProgress,
			isAddingToCampaigns,
			modalState.handleUsageLimitsOpen,
			chatContainerId,
			messages,
			chatHistoryLoaded,
			input,
			handleChatInputChange,
			handleFormSubmit,
			handleKeyDown,
			isLoading,
			stop,
			formatTime,
			agentStatus,
			handleSuggestionSubmit,
			onUploadFiles,
			textareaHeight,
			setTextareaHeight,
			pendingToolCallConfirmation,
			invisibleUserContentsVersion,
			handleHelpAction,
			handleSessionRecapRequest,
			selectedCampaign,
			handleNextStepsRequest,
			canReviewShards,
			visibleShardGroups,
			shardsLoading,
			removeProcessedShards,
			fetchAllStagedShards,
			onProposalConfirm,
			onProposalCancel,
			handleUpload,
			handleFileUpdate,
			handleFileUploadTriggered,
			triggerFileUpload,
			setTriggerFileUpload,
			authReady,
		]
	);

	return (
		<AppShellContext.Provider value={value}>
			{children}
		</AppShellContext.Provider>
	);
}
