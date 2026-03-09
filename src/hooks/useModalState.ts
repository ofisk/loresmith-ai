import { useCallback, useEffect, useState } from "react";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";
import { logger } from "@/lib/logger";
import type { Campaign } from "@/types/campaign";

export function useModalState() {
	// Modal state
	const [showAuthModal, setShowAuthModal] = useState(false);
	const [googlePendingToken, setGooglePendingToken] = useState<string | null>(
		null
	);
	const [authVerifyError, setAuthVerifyError] = useState<string | null>(null);
	const [authVerifySuccess, setAuthVerifySuccess] = useState(false);

	// Log auth modal state changes for debugging
	useEffect(() => {
		logger.scope("[useModalState]").debug("Auth modal state changed", {
			showAuthModal,
		});
	}, [showAuthModal]);
	const [isCreateCampaignModalOpen, setIsCreateCampaignModalOpen] =
		useState(false);
	const [isCampaignDetailsModalOpen, setIsCampaignDetailsModalOpen] =
		useState(false);
	const [isAddResourceModalOpen, setIsAddResourceModalOpen] = useState(false);
	const [isAddToCampaignModalOpen, setIsAddToCampaignModalOpen] =
		useState(false);
	const [isEditFileModalOpen, setIsEditFileModalOpen] = useState(false);
	const [isAdminDashboardModalOpen, setIsAdminDashboardModalOpen] =
		useState(false);
	const [isProposalConfirmModalOpen, setIsProposalConfirmModalOpen] =
		useState(false);
	const [proposalConfirmLegalNotice, setProposalConfirmLegalNotice] =
		useState("");
	const [showRateLimitModal, setShowRateLimitModal] = useState(false);
	const [rateLimitNextResetAt, setRateLimitNextResetAt] = useState<
		string | null
	>(null);
	const [rateLimitReason, setRateLimitReason] = useState<string | undefined>();
	const [showUsageLimitsModal, setShowUsageLimitsModal] = useState(false);
	const [showQuotaWarningModal, setShowQuotaWarningModal] = useState(false);
	const [quotaWarningPayload, setQuotaWarningPayload] = useState<{
		reason: string;
		monthlyUsage?: number;
		monthlyLimit?: number;
		creditsRemaining?: number;
	} | null>(null);

	// Modal data state
	const [campaignName, setCampaignName] = useState("");
	const [campaignDescription, setCampaignDescription] = useState("");
	const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(
		null
	);
	const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
	const [selectedFile, setSelectedFile] =
		useState<ResourceFileWithCampaigns | null>(null);
	const [editingFile, setEditingFile] =
		useState<ResourceFileWithCampaigns | null>(null);

	// Modal handlers
	const handleCreateCampaign = useCallback(() => {
		setIsCreateCampaignModalOpen(true);
	}, []);

	const handleCreateCampaignClose = useCallback(() => {
		setIsCreateCampaignModalOpen(false);
		setCampaignName("");
		setCampaignDescription("");
	}, []);

	const handleCampaignClick = useCallback((campaign: Campaign) => {
		setSelectedCampaign(campaign);
		setIsCampaignDetailsModalOpen(true);
	}, []);

	const handleCampaignDetailsClose = useCallback(() => {
		setIsCampaignDetailsModalOpen(false);
		setSelectedCampaign(null);
	}, []);

	const handleAddResource = useCallback(() => {
		setIsAddResourceModalOpen(true);
	}, []);

	const handleAddResourceClose = useCallback(() => {
		setIsAddResourceModalOpen(false);
		setSelectedCampaigns([]);
	}, []);

	const handleAddToCampaign = useCallback((file: ResourceFileWithCampaigns) => {
		setSelectedFile(file);
		setIsAddToCampaignModalOpen(true);
	}, []);

	const handleAddToCampaignClose = useCallback(() => {
		setIsAddToCampaignModalOpen(false);
		setSelectedFile(null);
	}, []);

	const handleEditFile = useCallback((file: ResourceFileWithCampaigns) => {
		setEditingFile(file);
		setIsEditFileModalOpen(true);
	}, []);

	const handleEditFileClose = useCallback(() => {
		setIsEditFileModalOpen(false);
		setEditingFile(null);
	}, []);

	const handleAdminDashboardOpen = useCallback(() => {
		setIsAdminDashboardModalOpen(true);
	}, []);

	const handleAdminDashboardClose = useCallback(() => {
		setIsAdminDashboardModalOpen(false);
	}, []);

	const showProposalConfirmModal = useCallback((legalNotice: string) => {
		setProposalConfirmLegalNotice(legalNotice);
		setIsProposalConfirmModalOpen(true);
	}, []);

	const hideProposalConfirmModal = useCallback(() => {
		setIsProposalConfirmModalOpen(false);
		setProposalConfirmLegalNotice("");
	}, []);

	const showRateLimitReachedModal = useCallback(
		(reason?: string, nextResetAt?: string | null) => {
			setRateLimitReason(reason);
			setRateLimitNextResetAt(nextResetAt ?? null);
			setShowRateLimitModal(true);
		},
		[]
	);

	const hideRateLimitModal = useCallback(() => {
		setShowRateLimitModal(false);
		setRateLimitNextResetAt(null);
		setRateLimitReason(undefined);
	}, []);

	const handleUsageLimitsOpen = useCallback(() => {
		setShowUsageLimitsModal(true);
	}, []);

	const handleUsageLimitsClose = useCallback(() => {
		setShowUsageLimitsModal(false);
	}, []);

	const showQuotaWarningModalFn = useCallback(
		(payload: {
			reason: string;
			monthlyUsage?: number;
			monthlyLimit?: number;
			creditsRemaining?: number;
		}) => {
			setQuotaWarningPayload(payload);
			setShowQuotaWarningModal(true);
		},
		[]
	);

	const hideQuotaWarningModal = useCallback(() => {
		setShowQuotaWarningModal(false);
		setQuotaWarningPayload(null);
	}, []);

	return {
		// Modal state
		showAuthModal,
		setShowAuthModal,
		googlePendingToken,
		setGooglePendingToken,
		authVerifyError,
		setAuthVerifyError,
		authVerifySuccess,
		setAuthVerifySuccess,
		isCreateCampaignModalOpen,
		setIsCreateCampaignModalOpen,
		isCampaignDetailsModalOpen,
		isAddResourceModalOpen,
		setIsAddResourceModalOpen,
		isAddToCampaignModalOpen,
		isEditFileModalOpen,
		isAdminDashboardModalOpen,
		setIsAdminDashboardModalOpen,
		isProposalConfirmModalOpen,
		proposalConfirmLegalNotice,
		showProposalConfirmModal,
		hideProposalConfirmModal,
		showRateLimitModal,
		showRateLimitReachedModal,
		hideRateLimitModal,
		rateLimitNextResetAt,
		rateLimitReason,
		showUsageLimitsModal,
		handleUsageLimitsOpen,
		handleUsageLimitsClose,
		showQuotaWarningModal,
		quotaWarningPayload,
		showQuotaWarningModalFn,
		hideQuotaWarningModal,

		// Modal data state
		campaignName,
		setCampaignName,
		campaignDescription,
		setCampaignDescription,
		selectedCampaign,
		setSelectedCampaign,
		selectedCampaigns,
		setSelectedCampaigns,
		selectedFile,
		setSelectedFile,
		editingFile,
		setEditingFile,

		// Modal handlers
		handleCreateCampaign,
		handleCreateCampaignClose,
		handleCampaignClick,
		handleCampaignDetailsClose,
		handleAddResource,
		handleAddResourceClose,
		handleAddToCampaign,
		handleAddToCampaignClose,
		handleEditFile,
		handleEditFileClose,
		handleAdminDashboardOpen,
		handleAdminDashboardClose,
	};
}
