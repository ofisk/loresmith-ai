import { useCallback, useState } from "react";
import { NOTIFICATION_TYPES } from "@/constants/notification-types";
import type { QueuedReason } from "@/contexts/ActionQueueContext";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import { formatErrorMessage } from "@/lib/error-parsing";
import { QuotaExceededError } from "@/lib/errors";
import {
	getBlockedExtensionsDescription,
	isFileAllowedForProposal,
	PROPOSAL_LEGAL_NOTICE,
} from "@/lib/proposal-security";
import { authenticatedFetchWithExpiration } from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";

export type ProposalConfirmationFn = (legalNotice: string) => Promise<boolean>;

export type QuotaExceededPayload = {
	reason: string;
	monthlyUsage?: number;
	monthlyLimit?: number;
	creditsRemaining?: number;
};

export type AddToQueueFn = (params: {
	actionType: string;
	label: string;
	payload: { file_key: string; file_name: string; campaignIds: string[] };
	reason: QueuedReason;
}) => void;

export function useCampaignAddition(
	getProposalConfirmation?: ProposalConfirmationFn,
	onQuotaExceeded?: (payload: QuotaExceededPayload) => void,
	addToQueue?: AddToQueueFn
) {
	// Campaign addition progress tracking
	const [campaignAdditionProgress, setCampaignAdditionProgress] = useState<
		Record<string, number>
	>({});
	const [isAddingToCampaigns, setIsAddingToCampaigns] = useState(false);

	const addFileToCampaigns = useCallback(
		async (
			selectedFile: ResourceFileWithCampaigns,
			selectedCampaigns: string[],
			getStoredJwt: () => string | null,
			addLocalNotification: (
				type: string,
				title: string,
				message: string
			) => void,
			onSuccess?: () => void,
			getProposalConfirmationOverride?: ProposalConfirmationFn,
			onQuotaExceededOverride?: (payload: QuotaExceededPayload) => void
		) => {
			const quotaHandler = onQuotaExceededOverride ?? onQuotaExceeded;
			const confirmFn =
				getProposalConfirmationOverride ?? getProposalConfirmation;
			if (selectedCampaigns.length === 0) {
				addLocalNotification(
					NOTIFICATION_TYPES.ERROR,
					"No Campaigns Selected",
					"Please select at least one campaign to add the file to."
				);
				return;
			}

			if (!selectedFile) {
				addLocalNotification(
					NOTIFICATION_TYPES.ERROR,
					"No File Selected",
					"No file selected."
				);
				return;
			}

			// Start progress tracking
			const fileKey = selectedFile.file_key;
			const fileName = selectedFile.file_name;
			const campaignIds = [...selectedCampaigns];

			setIsAddingToCampaigns(true);
			setCampaignAdditionProgress({ [fileKey]: 0 });

			try {
				const jwt = getStoredJwt();
				if (!jwt) {
					addLocalNotification(
						NOTIFICATION_TYPES.ERROR,
						"Authentication Required",
						"Please log in again to add files to campaigns."
					);
					return;
				}

				let lastResourceId: string | undefined;
				const addedCampaignIds: string[] = [];
				// Add file to each selected campaign with progress updates
				for (let i = 0; i < campaignIds.length; i++) {
					const campaignId = campaignIds[i];
					const progress = Math.round(((i + 1) / campaignIds.length) * 100);

					// Update progress
					setCampaignAdditionProgress({ [fileKey]: progress });

					const { response, jwtExpired } =
						await authenticatedFetchWithExpiration(
							API_CONFIG.buildUrl(
								API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE(campaignId)
							),
							{
								method: "POST",
								jwt,
								headers: {
									"Content-Type": "application/json",
								},
								body: JSON.stringify({
									type: "file",
									id: selectedFile.file_key,
									name: selectedFile.file_name,
								}),
							}
						);

					if (jwtExpired) {
						addLocalNotification(
							NOTIFICATION_TYPES.ERROR,
							"Session Expired",
							"Your session has expired. Please log in again."
						);
						return;
					}

					if (!response.ok) {
						const errorText = await response.text();
						const remainingCampaignIds = campaignIds.filter(
							(id) => !addedCampaignIds.includes(id)
						);
						if (response.status === 402 && addToQueue) {
							try {
								const errBody = JSON.parse(errorText) as {
									code?: string;
									error?: string;
								};
								if (errBody.code === "QUOTA_EXCEEDED") {
									addToQueue({
										actionType: "add_to_campaign",
										label: `Add "${fileName}" to ${remainingCampaignIds.length} campaign(s)`,
										payload: {
											file_key: fileKey,
											file_name: fileName,
											campaignIds: remainingCampaignIds,
										},
										reason: "quota",
									});
									addLocalNotification(
										NOTIFICATION_TYPES.SUCCESS,
										"Queued",
										remainingCampaignIds.length === campaignIds.length
											? `"${fileName}" queued – will retry when capacity is available.`
											: `Partial success. Remaining add(s) for "${fileName}" queued – will retry when capacity is available.`
									);
									break;
								}
							} catch {
								// Fall through to generic error handling
							}
						}
						if (response.status === 429 && addToQueue) {
							try {
								const errBody = JSON.parse(errorText) as {
									code?: string;
								};
								if (errBody.code === "RESOURCE_ADD_RATE_LIMIT") {
									addToQueue({
										actionType: "add_to_campaign",
										label: `Add "${fileName}" to ${remainingCampaignIds.length} campaign(s)`,
										payload: {
											file_key: fileKey,
											file_name: fileName,
											campaignIds: remainingCampaignIds,
										},
										reason: "rate_limit",
									});
									addLocalNotification(
										NOTIFICATION_TYPES.SUCCESS,
										"Queued",
										remainingCampaignIds.length === campaignIds.length
											? `"${fileName}" queued – will retry when limit resets.`
											: `Partial success. Remaining add(s) for "${fileName}" queued – will retry when limit resets.`
									);
									break;
								}
							} catch {
								// Fall through to generic error handling
							}
						}
						if (response.status === 402 && !addToQueue && quotaHandler) {
							try {
								const errBody = JSON.parse(errorText) as {
									code?: string;
									error?: string;
									monthlyUsage?: number;
									monthlyLimit?: number;
									creditsRemaining?: number;
								};
								if (errBody.code === "QUOTA_EXCEEDED") {
									quotaHandler({
										reason: errBody.error ?? "Token quota exceeded.",
										monthlyUsage: errBody.monthlyUsage,
										monthlyLimit: errBody.monthlyLimit,
										creditsRemaining: errBody.creditsRemaining,
									});
									throw new QuotaExceededError(errBody.error);
								}
							} catch (e) {
								if (e instanceof QuotaExceededError) throw e;
							}
						}
						if (response.status === 403) {
							try {
								const errBody = JSON.parse(errorText) as {
									useProposeInstead?: boolean;
								};
								if (errBody.useProposeInstead) {
									if (!isFileAllowedForProposal(fileName)) {
										addLocalNotification(
											NOTIFICATION_TYPES.ERROR,
											"File type not allowed",
											`This file type cannot be proposed. Allowed formats: ${getBlockedExtensionsDescription()}`
										);
										return;
									}
									const confirmed = confirmFn
										? await confirmFn(PROPOSAL_LEGAL_NOTICE)
										: false;
									if (!confirmed) {
										addLocalNotification(
											NOTIFICATION_TYPES.ERROR,
											"Confirmation required",
											"You must confirm the legal notice before proposing this file."
										);
										return;
									}
									const proposeRes = await authenticatedFetchWithExpiration(
										API_CONFIG.buildUrl(
											API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSALS(
												campaignId
											)
										),
										{
											method: "POST",
											jwt: getStoredJwt() ?? undefined,
											headers: { "Content-Type": "application/json" },
											body: JSON.stringify({
												fileKey: selectedFile.file_key,
												fileName: selectedFile.file_name,
												confirmedLegal: true,
											}),
										}
									);
									if (proposeRes.response.ok) {
										addLocalNotification(
											NOTIFICATION_TYPES.SUCCESS,
											"Proposal submitted",
											`"${fileName}" has been proposed for campaign approval. The GM will review it.`
										);
										continue;
									}
								}
							} catch {
								// Fall through to throw
							}
						}
						const { parseErrorResponse, formatErrorForNotification } =
							await import("@/lib/error-parsing");
						const parsedError = parseErrorResponse(errorText, response.status);
						throw new Error(formatErrorForNotification(parsedError));
					}

					const data = (await response.json()) as {
						resource?: { id?: string };
					};
					if (data?.resource?.id) {
						lastResourceId = data.resource.id;
					}
					addedCampaignIds.push(campaignId);
				}

				// Complete progress
				setCampaignAdditionProgress({ [fileKey]: 100 });

				if (addedCampaignIds.length > 0) {
					addLocalNotification(
						NOTIFICATION_TYPES.SUCCESS,
						"File added to campaign",
						`Successfully added "${fileName}" to ${addedCampaignIds.length} campaign(s)`
					);

					window.dispatchEvent(
						new CustomEvent(APP_EVENT_TYPE.CAMPAIGN_FILE_ADDED, {
							detail: {
								file: selectedFile,
								campaignIds: addedCampaignIds,
								campaignCount: addedCampaignIds.length,
							},
						})
					);
				}

				// Call success callback if provided
				if (onSuccess) {
					onSuccess();
				}

				// Clear progress after a short delay
				setTimeout(() => {
					setCampaignAdditionProgress((prev) => {
						const newProgress = { ...prev };
						delete newProgress[fileKey];
						return newProgress;
					});
					setIsAddingToCampaigns(false);
				}, 1500);

				return lastResourceId;
			} catch (error) {
				if (error instanceof QuotaExceededError) {
					// Quota modal already shown by onQuotaExceeded
					setCampaignAdditionProgress((prev) => {
						const newProgress = { ...prev };
						delete newProgress[fileKey];
						return newProgress;
					});
					setIsAddingToCampaigns(false);
					return;
				}
				const errorMessage = formatErrorMessage(error);
				addLocalNotification(
					NOTIFICATION_TYPES.ERROR,
					"Error adding file to campaign",
					`Error adding file to campaigns: ${errorMessage}`
				);

				// Clear progress on error
				setCampaignAdditionProgress((prev) => {
					const newProgress = { ...prev };
					delete newProgress[fileKey];
					return newProgress;
				});
				setIsAddingToCampaigns(false);
			}
		},
		[getProposalConfirmation, onQuotaExceeded, addToQueue]
	);

	return {
		campaignAdditionProgress,
		isAddingToCampaigns,
		addFileToCampaigns,
	};
}
