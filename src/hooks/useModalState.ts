import { useCallback, useEffect, useState } from "react";
import type { Campaign } from "@/types/campaign";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";
import { logger } from "@/lib/logger";

export function useModalState() {
  // Modal state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [googlePendingToken, setGooglePendingToken] = useState<string | null>(
    null
  );

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

  return {
    // Modal state
    showAuthModal,
    setShowAuthModal,
    googlePendingToken,
    setGooglePendingToken,
    isCreateCampaignModalOpen,
    setIsCreateCampaignModalOpen,
    isCampaignDetailsModalOpen,
    isAddResourceModalOpen,
    setIsAddResourceModalOpen,
    isAddToCampaignModalOpen,
    isEditFileModalOpen,
    isAdminDashboardModalOpen,
    setIsAdminDashboardModalOpen,

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
