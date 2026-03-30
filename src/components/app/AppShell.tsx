import Joyride from "react-joyride";
import { AppHeader } from "@/components/app/AppHeader";
import { ChatArea } from "@/components/app/ChatArea";
import { ResourceSidePanel } from "@/components/resource-side-panel";
import { ShardOverlay } from "@/components/shard/ShardOverlay";
import { useAppShellContext } from "@/contexts/AppShellContext";
import { useDismissibleLayer } from "@/hooks/useDismissibleLayer";

export function AppShell() {
	const ctx = useAppShellContext();

	useDismissibleLayer({
		open: ctx.isSidebarOpen,
		onClose: ctx.closeMobileSidebar,
	});

	return (
		<>
			<Joyride
				stepIndex={ctx.stepIndex}
				steps={ctx.tourSteps}
				run={ctx.runTour}
				continuous
				showSkipButton
				disableCloseOnEsc={false}
				disableScrolling={false}
				spotlightClicks={false}
				callback={ctx.onJoyrideCallback}
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
				<div
					className="h-full sm:h-[calc(100dvh-2rem)] md:h-[calc(100dvh-3rem)] w-full mx-auto max-w-[var(--width-container-xl)] flex flex-col shadow-2xl rounded-none sm:rounded-2xl relative border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 overflow-hidden"
					data-testid="app-main"
				>
					<AppHeader
						onToggleSidebar={ctx.onToggleSidebar}
						isSidebarOpen={ctx.isSidebarOpen}
						onHelpAction={ctx.handleHelpAction}
						onSessionRecapRequest={ctx.handleSessionRecapRequest}
						onNextStepsRequest={ctx.handleNextStepsRequest}
						notifications={ctx.allNotifications.map((n) => ({
							...n,
							message: n.message ?? "",
						}))}
						onDismissNotification={ctx.dismissNotification}
						onClearAllNotifications={ctx.clearAllNotifications}
						selectedCampaignId={ctx.selectedCampaignId}
						onAdminDashboardOpen={ctx.modalState.handleAdminDashboardOpen}
						selectedCampaignRole={ctx.selectedCampaign?.role ?? null}
						billingTier={ctx.billingStatus?.tier}
					/>

					<div className="flex-1 flex min-h-0 overflow-hidden rounded-bl-2xl rounded-br-2xl relative">
						<ResourceSidePanel className="hidden md:flex" />

						{ctx.isSidebarOpen && (
							<>
								<div
									className="absolute inset-0 md:hidden bg-black/40 [z-index:var(--z-panel)]"
									onClick={ctx.onToggleSidebar}
									aria-hidden="true"
								/>
								<ResourceSidePanel className="absolute inset-0 md:hidden w-full max-w-none shadow-2xl [z-index:var(--z-overlay)]" />
							</>
						)}

						<div className="flex-1 flex flex-col min-h-0 min-w-0">
							<ChatArea
								chatContainerId={ctx.chatContainerId}
								messages={ctx.messages}
								chatHistoryLoading={!ctx.chatHistoryLoaded}
								input={ctx.input}
								onInputChange={ctx.onInputChange}
								onFormSubmit={ctx.onFormSubmit}
								onKeyDown={ctx.onKeyDown}
								isLoading={ctx.isLoading}
								onStop={ctx.onStop}
								formatTime={ctx.formatTime}
								onSuggestionSubmit={ctx.onSuggestionSubmit}
								onWorkOnNextStep={ctx.onWorkOnNextStep}
								openPlanningTaskTitles={ctx.openPlanningTaskTitles}
								onUploadFiles={ctx.onUploadFiles}
								textareaHeight={ctx.textareaHeight}
								pendingToolCallConfirmation={ctx.pendingToolCallConfirmation}
								campaigns={ctx.campaigns}
								selectedCampaignId={ctx.selectedCampaignId}
								onSelectedCampaignChange={ctx.onSelectedCampaignChange}
								onCreateCampaign={ctx.modalState.handleCreateCampaign}
								invisibleUserContents={ctx.invisibleUserContents}
								agentStatus={ctx.agentStatus}
								chatError={ctx.chatError}
								onRegenerate={ctx.onRegenerate}
							/>
						</div>
					</div>
				</div>

				{ctx.canReviewShards && (
					<ShardOverlay
						shards={ctx.visibleShardGroups}
						isLoading={ctx.shardsLoading}
						onShardsProcessed={ctx.onShardsProcessed}
						getJwt={ctx.authState.getStoredJwt}
						onAutoExpand={() => {}}
						onRefresh={ctx.onShardRefresh}
					/>
				)}
			</div>
		</>
	);
}
