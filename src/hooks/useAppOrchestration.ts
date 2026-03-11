import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CAMPAIGN_ROLES } from "@/constants/campaign-roles";
import { NOTIFICATION_TYPES } from "@/constants/notification-types";
import { useActionQueue } from "@/contexts/ActionQueueContext";
import type { FileMetadata } from "@/dao";
import { useActionQueueRetry } from "@/hooks/useActionQueueRetry";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import { useAppAuthentication } from "@/hooks/useAppAuthentication";
import { useAppState } from "@/hooks/useAppState";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useBillingStatus } from "@/hooks/useBillingStatus";
import { useCampaignAddition } from "@/hooks/useCampaignAddition";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useGlobalShardManager } from "@/hooks/useGlobalShardManager";
import { useLocalNotifications } from "@/hooks/useLocalNotifications";
import { useModalState } from "@/hooks/useModalState";
import { useUploadQueueRetry } from "@/hooks/useUploadQueueRetry";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import { clearJoinIntent, getJoinIntent } from "@/lib/join-intent";

export function useAppOrchestration() {
	const modalState = useModalState();
	const authState = useAppAuthentication();

	const {
		chatContainerId,
		textareaHeight,
		setTextareaHeight,
		triggerFileUpload,
		setTriggerFileUpload,
	} = useAppState({ modalState, authState });

	const {
		createCampaign,
		campaigns,
		selectedCampaignId,
		selectedCampaign,
		setSelectedCampaignId,
		refetch: refetchCampaigns,
	} = useCampaigns();

	const [joinComplete, setJoinComplete] = useState(false);
	const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

	const joinToken =
		typeof window !== "undefined" &&
		window.location.pathname === "/join" &&
		!joinComplete
			? new URLSearchParams(window.location.search).get("token")
			: null;

	const showBillingPage =
		typeof window !== "undefined" && window.location.pathname === "/billing";

	const { data: billingStatus } = useBillingStatus();

	const {
		allNotifications,
		addLocalNotification,
		dismissNotification,
		clearAllNotifications,
	} = useLocalNotifications();

	const proposalConfirmResolveRef = useRef<((value: boolean) => void) | null>(
		null
	);

	const getProposalConfirmation = useCallback(
		(legalNotice: string) => {
			modalState.showProposalConfirmModal(legalNotice);
			return new Promise<boolean>((resolve) => {
				proposalConfirmResolveRef.current = resolve;
			});
		},
		[modalState]
	);

	const onProposalConfirm = useCallback(() => {
		proposalConfirmResolveRef.current?.(true);
		proposalConfirmResolveRef.current = null;
		modalState.hideProposalConfirmModal();
	}, [modalState]);

	const onProposalCancel = useCallback(() => {
		proposalConfirmResolveRef.current?.(false);
		proposalConfirmResolveRef.current = null;
		modalState.hideProposalConfirmModal();
	}, [modalState]);

	const actionQueue = useActionQueue();
	const addToQueue = actionQueue?.addToQueue;

	const { campaignAdditionProgress, isAddingToCampaigns, addFileToCampaigns } =
		useCampaignAddition(
			getProposalConfirmation,
			modalState.showQuotaWarningModalFn,
			addToQueue
		);

	const {
		checkShouldShowRecap,
		markRecapShown,
		checkHasBeenAway,
		updateActivity,
	} = useActivityTracking();

	const { handleUpload } = useFileUpload({
		onUploadSuccess: (filename, _fileKey) => {
			updateActivity();
			addLocalNotification(
				NOTIFICATION_TYPES.SUCCESS,
				"File uploaded",
				`"${filename}" has been uploaded and we're preparing it for your campaigns.`
			);
		},
		onUploadStart: () => {},
	});

	useUploadQueueRetry(handleUpload);
	useActionQueueRetry(
		{ addFileToCampaigns },
		authState.getStoredJwt,
		addLocalNotification
	);

	const handleFileUploadTriggered = useCallback(() => {
		setTriggerFileUpload(false);
	}, [setTriggerFileUpload]);

	const handleFileUpdate = useCallback(
		async (updatedFile: FileMetadata) => {
			if (typeof window !== "undefined") {
				window.dispatchEvent(
					new CustomEvent(APP_EVENT_TYPE.FILE_STATUS_UPDATED, {
						detail: {
							completeFileData: updatedFile,
							fileKey: updatedFile.file_key,
						},
					})
				);
			}
			addLocalNotification(
				NOTIFICATION_TYPES.SUCCESS,
				"File Updated",
				`"${updatedFile.file_name}" has been updated successfully.`
			);
			modalState.handleEditFileClose();
		},
		[modalState, addLocalNotification]
	);

	const handleJoinSuccess = useCallback(
		(campaignId: string) => {
			clearJoinIntent();
			window.history.replaceState(null, "", "/");
			setSelectedCampaignId(campaignId);
			refetchCampaigns();
			setJoinComplete(true);
		},
		[setSelectedCampaignId, refetchCampaigns]
	);

	const handleLogout = useCallback(async () => {
		try {
			await authState.handleLogout();
			modalState.setShowAuthModal(true);
		} catch {
			modalState.setShowAuthModal(true);
		}
	}, [authState, modalState]);

	// Hash handling: token, google_pending, verify
	useEffect(() => {
		if (typeof window === "undefined") return;
		const hash = window.location.hash?.replace(/^#/, "") || "";
		const params = new URLSearchParams(hash);
		const token = params.get("token");
		const googlePending = params.get("google_pending");
		const verify = params.get("verify");
		if (token && authState.acceptToken) {
			authState.acceptToken(token).then(() => {
				window.history.replaceState(
					null,
					"",
					window.location.pathname + window.location.search
				);
				modalState.setShowAuthModal(false);
			});
		} else if (googlePending) {
			modalState.setGooglePendingToken(googlePending);
			modalState.setShowAuthModal(true);
			window.history.replaceState(
				null,
				"",
				window.location.pathname + window.location.search
			);
		} else if (verify) {
			const verifyErrorMessages: Record<string, string> = {
				missing_token:
					"Verification link is incomplete. Please request a new one.",
				invalid_or_expired:
					"Verification link expired or invalid. Please request a new one.",
				error: "Verification failed. Please try again or request a new link.",
			};
			const message =
				verify === "success"
					? null
					: (verifyErrorMessages[verify] ??
						"Verification failed. Please try again.");
			modalState.setAuthVerifyError(message);
			modalState.setAuthVerifySuccess(verify === "success");
			modalState.setShowAuthModal(true);
			window.history.replaceState(
				null,
				"",
				window.location.pathname + window.location.search
			);
		}
	}, [
		authState.acceptToken,
		modalState.setGooglePendingToken,
		modalState.setShowAuthModal,
		modalState.setAuthVerifyError,
		modalState.setAuthVerifySuccess,
	]);

	useEffect(() => {
		if (!modalState.showAuthModal) {
			modalState.setAuthVerifyError(null);
			modalState.setAuthVerifySuccess(false);
		}
	}, [
		modalState.showAuthModal,
		modalState.setAuthVerifyError,
		modalState.setAuthVerifySuccess,
	]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const intent = getJoinIntent();
		if (!intent) return;
		const params = new URLSearchParams(window.location.search);
		const currentToken = params.get("token");
		const needsRedirect =
			window.location.pathname !== "/join" || currentToken !== intent.joinToken;
		if (needsRedirect) {
			window.location.replace(
				`/join?token=${encodeURIComponent(intent.joinToken)}`
			);
		}
	}, []);

	useEffect(() => {
		const handleResize = () => {
			if (window.innerWidth >= 768) {
				setIsMobileSidebarOpen(false);
			}
		};
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	const authReady = useAuthReady();

	const {
		shards: globalShards,
		isLoading: shardsLoading,
		fetchAllStagedShards,
		removeProcessedShards,
	} = useGlobalShardManager(authState.getStoredJwt);

	const campaignIdsWithShardApprovalPermission = useMemo(() => {
		const allowed = new Set<string>();
		for (const c of campaigns) {
			if (
				c.role === CAMPAIGN_ROLES.OWNER ||
				c.role === CAMPAIGN_ROLES.EDITOR_GM
			) {
				allowed.add(c.campaignId);
			}
		}
		return allowed;
	}, [campaigns]);

	const visibleShardGroups = useMemo(() => {
		const getShardCampaignId = (
			group: (typeof globalShards)[number]
		): string | null => {
			const g = group as {
				campaignId?: string;
				sourceRef?: { meta?: { campaignId?: string }; campaignId?: string };
				metadata?: { campaignId?: string };
			};
			return (
				g?.campaignId ||
				g?.sourceRef?.meta?.campaignId ||
				g?.sourceRef?.campaignId ||
				g?.metadata?.campaignId ||
				null
			);
		};
		return globalShards.filter((group) => {
			const campaignId = getShardCampaignId(group);
			return (
				campaignId && campaignIdsWithShardApprovalPermission.has(campaignId)
			);
		});
	}, [globalShards, campaignIdsWithShardApprovalPermission]);

	const canReviewShards =
		campaignIdsWithShardApprovalPermission.size > 0 &&
		(!selectedCampaignId ||
			campaignIdsWithShardApprovalPermission.has(selectedCampaignId));

	const shardsReadyRefetchTimeoutRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null);

	useEffect(() => {
		return () => {
			if (shardsReadyRefetchTimeoutRef.current) {
				clearTimeout(shardsReadyRefetchTimeoutRef.current);
				shardsReadyRefetchTimeoutRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (authState.isAuthenticated) {
			fetchAllStagedShards();
		}
	}, [authState.isAuthenticated, fetchAllStagedShards]);

	return {
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
		joinComplete,
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
		globalShards,
		shardsLoading,
		fetchAllStagedShards,
		removeProcessedShards,
		visibleShardGroups,
		canReviewShards,
		shardsReadyRefetchTimeoutRef,
		getProposalConfirmation,
	};
}
