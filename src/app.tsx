import type React from "react";
import { useCallback, useEffect } from "react";
import { CONTEXT_RECAP_PLACEHOLDER } from "@/app-constants";
import { AppModals } from "@/components/app/AppModals";
import { AppShell } from "@/components/app/AppShell";
import { BillingPage } from "@/components/billing/BillingPage";
import { JoinCampaignPage } from "@/components/join/JoinCampaignPage";
import { PLAYER_ROLES } from "@/constants/campaign-roles";
import { useAppEventHandlers } from "@/hooks/useAppEventHandlers";
import { useAppOrchestration } from "@/hooks/useAppOrchestration";
import { useChatSession } from "@/hooks/useChatSession";
import { useTourState } from "@/hooks/useTourState";
import { useUiHints } from "@/hooks/useUiHints";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { AuthService } from "@/services/core/auth-service";

export default function Chat() {
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
		handleLogout,
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

	// Feature flag example: when FEATURES.friends is true (set in GitHub), print a greeting
	useEffect(() => {
		if (isFeatureEnabled("friends")) {
			console.log("hey we're happy you're here");
		}
	}, []);

	// Console greeting only for specific users (aniham, ofisk)
	useEffect(() => {
		if (username === "aniham" || username === "ofisk") {
			console.log("hi you");
		}
	}, [username]);

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
		onContextRecapRequest: () =>
			invisibleUserContentsRef.current.add(CONTEXT_RECAP_PLACEHOLDER),
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

	if (showBillingPage) {
		return <BillingPage onBack={() => (window.location.href = "/")} />;
	}

	if (joinToken) {
		return (
			<>
				<JoinCampaignPage
					token={joinToken}
					jwt={authState.getStoredJwt()}
					onOpenAuthModal={() => modalState.setShowAuthModal(true)}
					onJoinSuccess={handleJoinSuccess}
				/>
				<AppModals
					billingLimits={billingStatus?.limits}
					modalState={modalState}
					authState={authState}
					campaigns={campaigns}
					refetchCampaigns={refetchCampaigns}
					createCampaign={createCampaign}
					handleUpload={handleUpload}
					handleFileUpdate={handleFileUpdate}
					addFileToCampaigns={addFileToCampaigns}
					addLocalNotification={(type, title, message?) =>
						addLocalNotification(type, title, message ?? "")
					}
					onProposalConfirm={onProposalConfirm}
					onProposalCancel={onProposalCancel}
				/>
			</>
		);
	}

	return (
		<>
			<AppShell
				runTour={tour.runTour}
				stepIndex={tour.stepIndex}
				tourSteps={tour.steps}
				onJoyrideCallback={tour.handleJoyrideCallback}
				onToggleSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
				isSidebarOpen={isMobileSidebarOpen}
				onHelpAction={handleHelpAction}
				onSessionRecapRequest={
					selectedCampaign?.role && !PLAYER_ROLES.has(selectedCampaign.role)
						? handleSessionRecapRequest
						: undefined
				}
				onNextStepsRequest={handleNextStepsRequest}
				notifications={allNotifications}
				onDismissNotification={dismissNotification}
				onClearAllNotifications={clearAllNotifications}
				selectedCampaignId={selectedCampaignId}
				onAdminDashboardOpen={modalState.handleAdminDashboardOpen}
				selectedCampaignRole={selectedCampaign?.role ?? null}
				billingTier={billingStatus?.tier}
				authState={authState}
				campaigns={campaigns}
				onLogout={handleLogout}
				triggerFileUpload={triggerFileUpload}
				onFileUploadTriggered={handleFileUploadTriggered}
				onCreateCampaign={modalState.handleCreateCampaign}
				onCampaignClick={modalState.handleCampaignClick}
				onAddResource={modalState.handleAddResource}
				onAddToCampaign={modalState.handleAddToCampaign}
				onEditFile={modalState.handleEditFile}
				campaignAdditionProgress={campaignAdditionProgress}
				isAddingToCampaigns={isAddingToCampaigns}
				addLocalNotification={addLocalNotification}
				onShowUsageLimits={modalState.handleUsageLimitsOpen}
				chatContainerId={chatContainerId}
				messages={messages}
				chatHistoryLoading={!chatHistoryLoaded}
				input={input ?? ""}
				onInputChange={handleChatInputChange}
				onFormSubmit={handleFormSubmit}
				onKeyDown={handleKeyDown}
				isLoading={isLoading}
				onStop={stop}
				formatTime={formatTime}
				agentStatus={agentStatus}
				onSuggestionSubmit={handleSuggestionSubmit}
				onUploadFiles={() => setTriggerFileUpload(true)}
				textareaHeight={textareaHeight}
				pendingToolCallConfirmation={pendingToolCallConfirmation}
				onSelectedCampaignChange={setSelectedCampaignId}
				invisibleUserContents={invisibleUserContentsRef.current}
				canReviewShards={canReviewShards ?? false}
				visibleShardGroups={visibleShardGroups}
				shardsLoading={shardsLoading}
				onShardsProcessed={removeProcessedShards}
				onShardRefresh={fetchAllStagedShards}
			/>
			<AppModals
				billingLimits={billingStatus?.limits}
				modalState={modalState}
				authState={authState}
				campaigns={campaigns}
				refetchCampaigns={refetchCampaigns}
				createCampaign={createCampaign}
				handleUpload={handleUpload}
				handleFileUpdate={handleFileUpdate}
				addFileToCampaigns={addFileToCampaigns}
				addLocalNotification={(type, title, message?) =>
					addLocalNotification(type, title, message ?? "")
				}
				onProposalConfirm={onProposalConfirm}
				onProposalCancel={onProposalCancel}
			/>
		</>
	);
}
