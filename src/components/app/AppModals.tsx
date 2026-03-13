import { useCallback, useEffect } from "react";
import { TelemetryDashboard } from "@/components/admin/TelemetryDashboard";
import { BlockingAuthenticationModal } from "@/components/BlockingAuthenticationModal";
import { QuotaWarningModal } from "@/components/billing/QuotaWarningModal";
import { FormButton } from "@/components/button/FormButton";
import { Modal } from "@/components/modal/Modal";
import {
	RateLimitReachedModal,
	UsageLimitsModal,
} from "@/components/rate-limit";
import { CampaignDetailsModal } from "@/components/resource-side-panel/CampaignDetailsModal";
import { CreateCampaignModal } from "@/components/resource-side-panel/CreateCampaignModal";
import { EditFileModal } from "@/components/upload/EditFileModal";
import { ResourceUpload } from "@/components/upload/ResourceUpload";
import { EDIT_ROLES } from "@/constants/campaign-roles";
import { NOTIFICATION_TYPES } from "@/constants/notification-types";
import type { QueuedFile } from "@/contexts/UploadQueueContext";
import { useUploadQueue } from "@/contexts/UploadQueueContext";
import type { FileMetadata } from "@/dao";
import type { useAppAuthentication } from "@/hooks/useAppAuthentication";
import type { useCampaignAddition } from "@/hooks/useCampaignAddition";
import type { useLocalNotifications } from "@/hooks/useLocalNotifications";
import type { useModalState } from "@/hooks/useModalState";
import { getDisplayName } from "@/lib/display-name-utils";
import { getJoinIntent } from "@/lib/join-intent";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { authenticatedFetchWithExpiration } from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";
import type { Campaign } from "@/types/campaign";

interface AppModalsProps {
	/** Limits from billing API (optional); passed to UsageLimitsModal */
	billingLimits?: {
		tph?: number;
		qph?: number;
		tpd?: number;
		qpd?: number;
		resourcesPerCampaignPerHour?: number;
	};
	modalState: ReturnType<typeof useModalState>;
	authState: ReturnType<typeof useAppAuthentication>;
	campaigns: Campaign[];
	refetchCampaigns: () => Promise<Campaign[]>;
	createCampaign: (name: string, description?: string) => Promise<Campaign>;
	handleUpload: (
		file: File,
		filename: string,
		description: string,
		tags: string[]
	) => Promise<void>;
	handleFileUpdate: (updatedFile: FileMetadata) => Promise<void>;
	addFileToCampaigns: ReturnType<
		typeof useCampaignAddition
	>["addFileToCampaigns"];
	isAddingToCampaigns?: boolean;
	addLocalNotification: ReturnType<
		typeof useLocalNotifications
	>["addLocalNotification"];
	onProposalConfirm: () => void;
	onProposalCancel: () => void;
}

/**
 * AppModals component - Manages all application modals
 */
export function AppModals({
	billingLimits,
	modalState,
	authState,
	campaigns,
	refetchCampaigns,
	createCampaign,
	handleUpload,
	handleFileUpdate,
	addFileToCampaigns,
	isAddingToCampaigns = false,
	addLocalNotification,
	onProposalConfirm,
	onProposalCancel,
}: AppModalsProps) {
	const uploadQueue = useUploadQueue();
	// Debug: Log when auth modal state changes
	useEffect(() => {
		const log = logger.scope("[AppModals]");
		log.debug("Auth modal state changed", {
			showAuthModal: modalState.showAuthModal,
			username: authState.username,
		});
		if (modalState.showAuthModal) {
			log.info("Auth modal should be visible");
		} else {
			log.debug("Auth modal should be hidden");
		}
	}, [modalState.showAuthModal, authState.username]);

	// Ensure modal shows on initial load if no JWT exists
	const getStoredJwt = authState.getStoredJwt;
	const showAuthModal = modalState.showAuthModal;
	const setShowAuthModal = modalState.setShowAuthModal;
	useEffect(() => {
		const log = logger.scope("[AppModals]");
		const checkInitialAuth = async () => {
			const jwt = getStoredJwt();
			if (!jwt && !showAuthModal) {
				log.info("No JWT found on initial load, showing auth modal");
				setShowAuthModal(true);
			}
		};
		// Small delay to allow other hooks to initialize first
		const timer = setTimeout(checkInitialAuth, 100);
		return () => clearTimeout(timer);
	}, [getStoredJwt, showAuthModal, setShowAuthModal]);

	const handleCampaignDelete = useCallback(
		async (campaignId: string) => {
			try {
				const jwt = authState.getStoredJwt();
				if (!jwt) {
					addLocalNotification(
						NOTIFICATION_TYPES.ERROR,
						"Authentication Required",
						"Please authenticate to delete campaigns."
					);
					return;
				}

				const { response, jwtExpired } = await authenticatedFetchWithExpiration(
					API_CONFIG.buildUrl(
						API_CONFIG.ENDPOINTS.CAMPAIGNS.DELETE(campaignId)
					),
					{
						method: "DELETE",
						jwt,
					}
				);

				if (jwtExpired) {
					addLocalNotification(
						NOTIFICATION_TYPES.ERROR,
						"Session Expired",
						"Please authenticate again."
					);
					return;
				}

				if (!response.ok) {
					const errorData = (await response.json()) as { error?: string };
					throw new Error(errorData.error || "Failed to delete campaign");
				}

				addLocalNotification(
					NOTIFICATION_TYPES.SUCCESS,
					"Campaign Deleted",
					"Campaign deleted successfully."
				);

				await refetchCampaigns();
				modalState.handleCampaignDetailsClose();
			} catch (error) {
				addLocalNotification(
					NOTIFICATION_TYPES.ERROR,
					"Deletion Failed",
					error instanceof Error ? error.message : "Failed to delete campaign."
				);
			}
		},
		[authState, modalState, refetchCampaigns, addLocalNotification]
	);

	const handleAddToCampaignConfirm = useCallback(async () => {
		const file = modalState.selectedFile;
		const campaignIds = [...(modalState.selectedCampaigns ?? [])];
		if (!file || campaignIds.length === 0) return;
		try {
			await addFileToCampaigns(
				file,
				campaignIds,
				authState.getStoredJwt,
				addLocalNotification,
				() => {}
			);
			modalState.setSelectedCampaigns([]);
			modalState.handleAddToCampaignClose();
		} catch {
			// Keep modal open on error; addFileToCampaigns shows error notification
		}
	}, [
		modalState,
		authState.getStoredJwt,
		addLocalNotification,
		addFileToCampaigns,
	]);

	const handleCampaignUpdate = useCallback(
		async (campaignId: string, updates: Partial<Campaign>) => {
			try {
				const jwt = authState.getStoredJwt();
				if (!jwt) {
					addLocalNotification(
						NOTIFICATION_TYPES.ERROR,
						"Authentication Required",
						"Please authenticate to update campaigns."
					);
					return;
				}

				const { response, jwtExpired } = await authenticatedFetchWithExpiration(
					API_CONFIG.buildUrl(
						API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(campaignId)
					),
					{
						method: "PUT",
						jwt,
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify(updates),
					}
				);

				if (jwtExpired) {
					addLocalNotification(
						NOTIFICATION_TYPES.ERROR,
						"Session Expired",
						"Please authenticate again."
					);
					return;
				}

				if (!response.ok) {
					const errorData = (await response.json()) as { error?: string };
					throw new Error(errorData.error || "Failed to update campaign");
				}

				addLocalNotification(
					NOTIFICATION_TYPES.SUCCESS,
					"Campaign Updated",
					"Campaign updated successfully."
				);

				await refetchCampaigns();
				modalState.handleCampaignDetailsClose();
			} catch (error) {
				addLocalNotification(
					NOTIFICATION_TYPES.ERROR,
					"Update Failed",
					error instanceof Error ? error.message : "Failed to update campaign."
				);
			}
		},
		[authState, modalState, refetchCampaigns, addLocalNotification]
	);

	// Filter out campaigns that already contain the selected file
	const availableCampaigns = modalState.selectedFile
		? campaigns.filter((campaign) => {
				if (!modalState.selectedFile?.campaigns) return true;
				return !modalState.selectedFile.campaigns.some(
					(existingCampaign: Campaign) =>
						existingCampaign.campaignId === campaign.campaignId
				);
			})
		: [];

	return (
		<>
			<BlockingAuthenticationModal
				isOpen={modalState.showAuthModal}
				username={authState.username}
				googlePendingToken={modalState.googlePendingToken}
				initialError={modalState.authVerifyError}
				initialSuccessMessage={
					modalState.authVerifySuccess
						? "Email verified. You can sign in now."
						: null
				}
				onLoginSuccess={async (token) => {
					await authState.acceptToken(token);
					modalState.setGooglePendingToken(null);
					modalState.setShowAuthModal(false);
					// Redirect to join page if user was trying to join before auth
					const intent = getJoinIntent();
					if (intent) {
						const params = new URLSearchParams(window.location.search);
						const currentToken = params.get("token");
						const needsRedirect =
							window.location.pathname !== "/join" ||
							currentToken !== intent.joinToken;
						if (needsRedirect) {
							window.location.replace(
								`/join?token=${encodeURIComponent(intent.joinToken)}`
							);
						}
					}
				}}
			/>

			{/* Create Campaign Modal */}
			<Modal
				isOpen={modalState.isCreateCampaignModalOpen}
				onClose={modalState.handleCreateCampaignClose}
				className="modal-size-md"
			>
				<CreateCampaignModal
					isOpen={modalState.isCreateCampaignModalOpen}
					onClose={modalState.handleCreateCampaignClose}
					campaignName={modalState.campaignName}
					onCampaignNameChange={modalState.setCampaignName}
					campaignDescription={modalState.campaignDescription}
					onCampaignDescriptionChange={modalState.setCampaignDescription}
					onCreateCampaign={async (name, description) => {
						await createCampaign(name, description);
						await refetchCampaigns();
					}}
					onSuggestAddResource={() => {
						modalState.handleCreateCampaignClose();
						modalState.handleAddResource();
					}}
				/>
			</Modal>

			{/* Campaign Details Modal */}
			<CampaignDetailsModal
				campaign={modalState.selectedCampaign}
				isOpen={modalState.isCampaignDetailsModalOpen}
				onClose={modalState.handleCampaignDetailsClose}
				onDelete={handleCampaignDelete}
				onUpdate={handleCampaignUpdate}
				checkQuotaBeforeAdd={async () => ({ allowed: true })}
				onShowQuotaWarning={modalState.showQuotaWarningModalFn}
				addLocalNotification={addLocalNotification}
				onAddFileToCampaign={async (fileKey: string, fileName: string) => {
					if (modalState.selectedCampaign) {
						return await addFileToCampaigns(
							{ file_key: fileKey, file_name: fileName } as any,
							[modalState.selectedCampaign.campaignId],
							authState.getStoredJwt,
							addLocalNotification
						);
					}
				}}
			/>

			{/* Add Resource Modal */}
			<Modal
				isOpen={
					modalState.isAddResourceModalOpen &&
					!modalState.isCreateCampaignModalOpen
				}
				onClose={modalState.handleAddResourceClose}
				className="modal-size-lg"
			>
				<ResourceUpload
					onValidationError={(title, message) =>
						addLocalNotification(NOTIFICATION_TYPES.ERROR, title, message)
					}
					onUpload={async (file, filename, description, tags, options) => {
						// Only close modal when single file or user finished (keep open for multi-file so they can upload rest)
						if (!options?.keepModalOpen) {
							modalState.handleAddResourceClose();
						}

						try {
							await handleUpload(file, filename, description, tags);
						} catch (error) {
							const isLimit = (
								error as Error & { isUploadLimitExceeded?: boolean }
							)?.isUploadLimitExceeded;
							const isDuplicate = (
								error as Error & { isDuplicateFilename?: boolean }
							)?.isDuplicateFilename;
							if (isDuplicate) {
								addLocalNotification(
									NOTIFICATION_TYPES.ERROR,
									"Duplicate file",
									`"${filename}" already exists in your library. Please rename the file and try again.`
								);
							} else if (!isLimit) {
								addLocalNotification(
									NOTIFICATION_TYPES.ERROR,
									"Upload failed",
									`Failed to upload "${filename}". Please try again.`
								);
							}
							throw error;
						}
					}}
					onUploadLimitReached={(succeededCount, filesToQueue) => {
						if (uploadQueue) {
							const queued: QueuedFile[] = filesToQueue.map((f) => ({
								file: f.file,
								filename: f.filename,
								id: `${f.filename}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
							}));
							uploadQueue.addToQueue(queued);
						}
						modalState.handleAddResourceClose();
						addLocalNotification(
							NOTIFICATION_TYPES.SUCCESS,
							"Files queued",
							succeededCount > 0
								? `${succeededCount} file(s) uploaded. ${filesToQueue.length} file(s) queued – will retry when capacity is available.`
								: `${filesToQueue.length} file(s) queued – will retry when capacity is available.`
						);
					}}
					onCancel={modalState.handleAddResourceClose}
					className="border-0 p-0 shadow-none"
					jwtUsername={authState.getStoredJwt() || ""}
					campaigns={campaigns}
					selectedCampaigns={modalState.selectedCampaigns}
					onCampaignSelectionChange={modalState.setSelectedCampaigns}
					campaignName={modalState.campaignName}
					onCampaignNameChange={modalState.setCampaignName}
					onCreateCampaign={() => {
						modalState.setSelectedCampaigns([]);
						modalState.setIsCreateCampaignModalOpen(true);
					}}
					showCampaignSelection={true}
				/>
			</Modal>

			{/* Add to Campaign Modal */}
			<Modal
				isOpen={modalState.isAddToCampaignModalOpen}
				onClose={modalState.handleAddToCampaignClose}
				className="modal-size-md"
			>
				<div className="p-4 md:p-6 h-full flex flex-col min-h-0">
					<h3 className="text-lg font-semibold mb-4">
						{modalState.selectedFile
							? getDisplayName(modalState.selectedFile)
							: ""}
					</h3>
					<p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
						Choose which legendary adventures this tome shall join:
					</p>
					<div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
						{availableCampaigns.length === 0 ? (
							<div className="text-center py-6 space-y-3">
								<div className="text-sm text-neutral-500 dark:text-neutral-400">
									This file has already been added to all available campaigns.
								</div>
								<div className="text-xs text-neutral-400 dark:text-neutral-500">
									Create a new campaign to add this file to additional
									adventures.
								</div>
								<button
									type="button"
									onClick={() => {
										modalState.handleAddToCampaignClose();
										modalState.setIsCreateCampaignModalOpen(true);
									}}
									className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
								>
									Create new campaign
								</button>
							</div>
						) : (
							<div className="space-y-1 max-h-64 overflow-y-auto">
								{availableCampaigns.map((campaign) => {
									const isSelected = modalState.selectedCampaigns.includes(
										campaign.campaignId
									);
									const canAddToCampaign =
										!campaign.role || EDIT_ROLES.has(campaign.role);
									return (
										<label
											key={campaign.campaignId}
											className={cn(
												"flex items-center gap-3 px-3 py-2 rounded border-2 cursor-pointer transition-colors",
												"focus-within:ring-2 focus-within:ring-neutral-400 dark:focus-within:ring-neutral-500 focus-within:ring-offset-2 focus-within:ring-offset-white dark:focus-within:ring-offset-neutral-900",
												!canAddToCampaign
													? "bg-neutral-100 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 opacity-70 cursor-not-allowed"
													: isSelected
														? "bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700"
														: "bg-transparent border-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700"
											)}
											title={
												canAddToCampaign
													? campaign.name
													: "You do not have permission to add resources to this campaign"
											}
										>
											<input
												type="checkbox"
												checked={isSelected}
												disabled={!canAddToCampaign}
												onChange={() => {
													if (!canAddToCampaign) return;
													if (isSelected) {
														modalState.setSelectedCampaigns(
															modalState.selectedCampaigns.filter(
																(id) => id !== campaign.campaignId
															)
														);
													} else {
														modalState.setSelectedCampaigns([
															...modalState.selectedCampaigns,
															campaign.campaignId,
														]);
													}
												}}
												className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 focus-visible:ring-offset-2"
												aria-label={`Add to ${campaign.name}`}
											/>
											<span
												className={cn(
													"text-sm truncate flex-1 min-w-0",
													!canAddToCampaign
														? "text-neutral-400 dark:text-neutral-500"
														: "text-neutral-800 dark:text-neutral-200"
												)}
											>
												{campaign.name}
											</span>
											{isSelected && (
												<svg
													className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													aria-hidden
												>
													<title>Selected</title>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M5 13l4 4L19 7"
													/>
												</svg>
											)}
										</label>
									);
								})}
							</div>
						)}

						<div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-700">
							<div className="flex gap-2">
								{availableCampaigns.length > 0 && (
									<FormButton
										variant="primary"
										onClick={handleAddToCampaignConfirm}
										loading={isAddingToCampaigns}
										disabled={isAddingToCampaigns}
									>
										{isAddingToCampaigns ? "Adding…" : "Add"}
									</FormButton>
								)}
								<FormButton
									onClick={modalState.handleAddToCampaignClose}
									variant="secondary"
								>
									Cancel
								</FormButton>
							</div>
						</div>
					</div>
				</div>
			</Modal>

			{/* Edit File Modal */}
			{modalState.editingFile && (
				<EditFileModal
					key={modalState.editingFile.file_key} // Reset component state when file changes
					isOpen={modalState.isEditFileModalOpen}
					onClose={modalState.handleEditFileClose}
					file={{
						id: modalState.editingFile.id,
						file_key: modalState.editingFile.file_key,
						file_name: modalState.editingFile.file_name,
						display_name: modalState.editingFile.display_name,
						description: modalState.editingFile.description,
						tags: (() => {
							const tags = modalState.editingFile.tags;
							if (Array.isArray(tags)) {
								return tags;
							}
							if (typeof tags === "string") {
								try {
									const parsed = JSON.parse(tags);
									if (Array.isArray(parsed)) {
										return parsed;
									}
								} catch {
									// Not JSON, treat as comma-separated string
								}
								return tags
									.split(",")
									.map((t) => t.trim())
									.filter((t) => t.length > 0);
							}
							return [];
						})(),
					}}
					onUpdate={(updatedFile) => {
						handleFileUpdate(updatedFile as FileMetadata);
					}}
				/>
			)}

			{/* Proposal legal confirmation modal */}
			<Modal
				isOpen={modalState.isProposalConfirmModalOpen}
				onClose={onProposalCancel}
				className="modal-size-standard"
			>
				<div className="p-6">
					<h3 className="text-lg font-semibold mb-4">
						Confirm before proposing file
					</h3>
					<p className="text-sm text-neutral-600 dark:text-neutral-400 whitespace-pre-line mb-6">
						{modalState.proposalConfirmLegalNotice}
					</p>
					<div className="flex justify-end gap-2">
						<FormButton variant="secondary" onClick={onProposalCancel}>
							Cancel
						</FormButton>
						<FormButton variant="primary" onClick={onProposalConfirm}>
							I confirm, propose file
						</FormButton>
					</div>
				</div>
			</Modal>

			{/* Admin Dashboard Modal */}
			<Modal
				isOpen={modalState.isAdminDashboardModalOpen}
				onClose={modalState.handleAdminDashboardClose}
				className="modal-size-md"
			>
				<TelemetryDashboard />
			</Modal>

			{/* Rate limit reached modal */}
			<RateLimitReachedModal
				isOpen={modalState.showRateLimitModal}
				onClose={modalState.hideRateLimitModal}
				nextResetAt={modalState.rateLimitNextResetAt}
				reason={modalState.rateLimitReason}
			/>

			{/* Quota warning modal (pre-add resource or 402) */}
			<QuotaWarningModal
				isOpen={modalState.showQuotaWarningModal}
				onClose={modalState.hideQuotaWarningModal}
				reason={
					modalState.quotaWarningPayload?.reason ?? "Token quota exceeded."
				}
				monthlyUsage={modalState.quotaWarningPayload?.monthlyUsage}
				monthlyLimit={modalState.quotaWarningPayload?.monthlyLimit}
			/>

			{/* Usage limits modal */}
			<UsageLimitsModal
				isOpen={modalState.showUsageLimitsModal}
				onClose={modalState.handleUsageLimitsClose}
				limits={billingLimits}
			/>
		</>
	);
}
