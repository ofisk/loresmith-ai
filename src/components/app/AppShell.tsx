import type React from "react";
import Joyride from "react-joyride";
import { AppHeader } from "@/components/app/AppHeader";
import { ChatArea } from "@/components/app/ChatArea";
import { ResourceSidePanel } from "@/components/resource-side-panel";
import { ShardOverlay } from "@/components/shard/ShardOverlay";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";
import type { Message } from "@/types/ai-message";
import type { Campaign, CampaignRole } from "@/types/campaign";
import type { StagedShardGroup } from "@/types/shard";

interface AppShellProps {
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

	// Header
	onHelpAction: (action: string) => void;
	onSessionRecapRequest?: () => void;
	onNextStepsRequest: () => void;
	notifications: Array<{
		timestamp: number;
		type: string;
		title: string;
		message?: string;
		data?: Record<string, unknown>;
	}>;
	onDismissNotification: (timestamp: number) => void;
	onClearAllNotifications: () => void;
	selectedCampaignId: string | null;
	onAdminDashboardOpen: () => void;
	selectedCampaignRole: CampaignRole | null;
	billingTier?: "free" | "basic" | "pro" | null;

	// Auth & campaigns
	authState: {
		isAuthenticated: boolean;
		showUserMenu: boolean;
		setShowUserMenu: (show: boolean) => void;
		getStoredJwt: () => string | null;
	};
	campaigns: Campaign[];
	onLogout: () => Promise<void>;
	triggerFileUpload: boolean;
	onFileUploadTriggered: () => void;
	onCreateCampaign: () => void;
	onCampaignClick: (campaign: Campaign) => void;
	onAddResource: () => void;
	onAddToCampaign: (file: ResourceFileWithCampaigns) => void;
	onEditFile: (file: ResourceFileWithCampaigns) => void;
	campaignAdditionProgress: Record<string, number>;
	isAddingToCampaigns: boolean;
	addLocalNotification: (type: string, title: string, message: string) => void;
	onShowUsageLimits: () => void;

	// Chat
	chatContainerId: string;
	messages: Message[];
	chatHistoryLoading: boolean;
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
	pendingToolCallConfirmation: boolean;
	onSelectedCampaignChange: (campaignId: string | null) => void;
	invisibleUserContents: Set<string>;

	// Shard overlay
	canReviewShards: boolean;
	visibleShardGroups: StagedShardGroup[];
	shardsLoading: boolean;
	onShardsProcessed: (shardIds: string[]) => void;
	onShardRefresh: () => void;
}

export function AppShell({
	runTour,
	stepIndex,
	tourSteps,
	onJoyrideCallback,
	onToggleSidebar,
	isSidebarOpen,
	onHelpAction,
	onSessionRecapRequest,
	onNextStepsRequest,
	notifications,
	onDismissNotification,
	onClearAllNotifications,
	selectedCampaignId,
	onAdminDashboardOpen,
	selectedCampaignRole,
	billingTier,
	authState,
	campaigns,
	onLogout,
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
	chatContainerId,
	messages,
	chatHistoryLoading,
	input,
	onInputChange,
	onFormSubmit,
	onKeyDown,
	isLoading,
	onStop,
	formatTime,
	agentStatus,
	onSuggestionSubmit,
	onUploadFiles,
	textareaHeight,
	pendingToolCallConfirmation,
	onSelectedCampaignChange,
	invisibleUserContents,
	canReviewShards,
	visibleShardGroups,
	shardsLoading,
	onShardsProcessed,
	onShardRefresh,
}: AppShellProps) {
	return (
		<>
			<Joyride
				stepIndex={stepIndex}
				steps={tourSteps}
				run={runTour}
				continuous
				showSkipButton
				disableCloseOnEsc={false}
				disableScrolling={false}
				spotlightClicks={false}
				callback={onJoyrideCallback}
				locale={{
					next: "Next",
					last: "Done",
					skip: "Skip tour",
					back: "Back",
				}}
				styles={{
					options: {
						zIndex: 10000,
						arrowColor: "#262626",
						backgroundColor: "#262626",
						primaryColor: "#c084fc",
						textColor: "#e5e5e5",
					},
					tooltip: {
						backgroundColor: "#262626",
						borderRadius: "0.5rem",
						color: "#e5e5e5",
						fontSize: "0.875rem",
						padding: "1.5rem",
					},
					tooltipContainer: {
						textAlign: "left",
					},
					tooltipContent: {
						padding: "0.5rem 0",
					},
					buttonNext: {
						backgroundColor: "transparent",
						color: "#c084fc",
						fontSize: "0.875rem",
						fontWeight: 600,
						padding: "0.5rem 0",
						borderRadius: "0",
						outline: "none",
						border: "none",
					},
					buttonBack: {
						backgroundColor: "transparent",
						color: "#9ca3af",
						fontSize: "0.875rem",
						fontWeight: 600,
						padding: "0.5rem 0",
						marginRight: "1rem",
						border: "none",
					},
					buttonSkip: {
						backgroundColor: "transparent",
						color: "#9ca3af",
						fontSize: "0.875rem",
						fontWeight: 600,
						border: "none",
					},
					buttonClose: {
						display: "none",
					},
				}}
			/>
			<div className="h-dvh w-full p-0 sm:p-4 md:p-6 flex justify-center items-center bg-fixed">
				<div className="h-full sm:h-[calc(100dvh-2rem)] md:h-[calc(100dvh-3rem)] w-full mx-auto max-w-[1400px] flex flex-col shadow-2xl rounded-none sm:rounded-2xl relative border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 overflow-hidden">
					<AppHeader
						onToggleSidebar={onToggleSidebar}
						isSidebarOpen={isSidebarOpen}
						onHelpAction={onHelpAction}
						onSessionRecapRequest={onSessionRecapRequest}
						onNextStepsRequest={onNextStepsRequest}
						notifications={notifications.map((n) => ({
							...n,
							message: n.message ?? "",
						}))}
						onDismissNotification={onDismissNotification}
						onClearAllNotifications={onClearAllNotifications}
						selectedCampaignId={selectedCampaignId}
						onAdminDashboardOpen={onAdminDashboardOpen}
						selectedCampaignRole={selectedCampaignRole}
						billingTier={billingTier}
					/>

					<div className="flex-1 flex min-h-0 overflow-hidden rounded-bl-2xl rounded-br-2xl relative">
						<ResourceSidePanel
							className="hidden md:flex"
							isAuthenticated={authState.isAuthenticated}
							campaigns={campaigns}
							selectedCampaignId={selectedCampaignId ?? undefined}
							onLogout={onLogout}
							showUserMenu={authState.showUserMenu}
							setShowUserMenu={authState.setShowUserMenu}
							triggerFileUpload={triggerFileUpload}
							onFileUploadTriggered={onFileUploadTriggered}
							onCreateCampaign={onCreateCampaign}
							onCampaignClick={onCampaignClick}
							onAddResource={onAddResource}
							onAddToCampaign={onAddToCampaign}
							onEditFile={onEditFile}
							campaignAdditionProgress={campaignAdditionProgress}
							isAddingToCampaigns={isAddingToCampaigns}
							addLocalNotification={addLocalNotification}
							onShowUsageLimits={onShowUsageLimits}
						/>

						{isSidebarOpen && (
							<>
								<div
									className="absolute inset-0 z-30 md:hidden bg-black/40"
									onClick={onToggleSidebar}
									aria-hidden="true"
								/>
								<ResourceSidePanel
									className="absolute inset-0 z-40 md:hidden w-full max-w-none shadow-2xl"
									isAuthenticated={authState.isAuthenticated}
									campaigns={campaigns}
									selectedCampaignId={selectedCampaignId ?? undefined}
									onLogout={onLogout}
									showUserMenu={authState.showUserMenu}
									setShowUserMenu={authState.setShowUserMenu}
									triggerFileUpload={triggerFileUpload}
									onFileUploadTriggered={onFileUploadTriggered}
									onCreateCampaign={onCreateCampaign}
									onCampaignClick={onCampaignClick}
									onAddResource={onAddResource}
									onAddToCampaign={onAddToCampaign}
									onEditFile={onEditFile}
									campaignAdditionProgress={campaignAdditionProgress}
									isAddingToCampaigns={isAddingToCampaigns}
									addLocalNotification={addLocalNotification}
									onShowUsageLimits={onShowUsageLimits}
								/>
							</>
						)}

						<div className="flex-1 flex flex-col min-h-0 min-w-0">
							<ChatArea
								chatContainerId={chatContainerId}
								messages={messages}
								chatHistoryLoading={chatHistoryLoading}
								input={input}
								onInputChange={onInputChange}
								onFormSubmit={onFormSubmit}
								onKeyDown={onKeyDown}
								isLoading={isLoading}
								onStop={onStop}
								formatTime={formatTime}
								onSuggestionSubmit={onSuggestionSubmit}
								onUploadFiles={onUploadFiles}
								textareaHeight={textareaHeight}
								pendingToolCallConfirmation={pendingToolCallConfirmation}
								campaigns={campaigns}
								selectedCampaignId={selectedCampaignId}
								onSelectedCampaignChange={onSelectedCampaignChange}
								onCreateCampaign={onCreateCampaign}
								invisibleUserContents={invisibleUserContents}
								agentStatus={agentStatus}
							/>
						</div>
					</div>
				</div>

				{canReviewShards && (
					<ShardOverlay
						shards={visibleShardGroups}
						isLoading={shardsLoading}
						onShardsProcessed={onShardsProcessed}
						getJwt={authState.getStoredJwt}
						onAutoExpand={() => {}}
						onRefresh={onShardRefresh}
					/>
				)}
			</div>
		</>
	);
}
