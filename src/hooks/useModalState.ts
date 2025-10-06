import { useCallback, useState } from "react";

export function useModalState() {
  // Modal state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isCreateCampaignModalOpen, setIsCreateCampaignModalOpen] =
    useState(false);
  const [isCampaignDetailsModalOpen, setIsCampaignDetailsModalOpen] =
    useState(false);
  const [isAddResourceModalOpen, setIsAddResourceModalOpen] = useState(false);
  const [isAddToCampaignModalOpen, setIsAddToCampaignModalOpen] =
    useState(false);
  const [isEditFileModalOpen, setIsEditFileModalOpen] = useState(false);

  // Modal data state
  const [campaignName, setCampaignName] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [editingFile, setEditingFile] = useState<any>(null);

  // Modal handlers
  const handleCreateCampaign = useCallback(() => {
    setIsCreateCampaignModalOpen(true);
  }, []);

  const handleCreateCampaignClose = useCallback(() => {
    setIsCreateCampaignModalOpen(false);
    setCampaignName("");
    setCampaignDescription("");
  }, []);

  const handleCampaignClick = useCallback((campaign: any) => {
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

  const handleAddToCampaign = useCallback((file: any) => {
    setSelectedFile(file);
    setIsAddToCampaignModalOpen(true);
  }, []);

  const handleAddToCampaignClose = useCallback(() => {
    setIsAddToCampaignModalOpen(false);
    setSelectedFile(null);
  }, []);

  const handleEditFile = useCallback((file: any) => {
    setEditingFile(file);
    setIsEditFileModalOpen(true);
  }, []);

  const handleEditFileClose = useCallback(() => {
    setIsEditFileModalOpen(false);
    setEditingFile(null);
  }, []);

  return {
    // Modal state
    showAuthModal,
    setShowAuthModal,
    isCreateCampaignModalOpen,
    setIsCreateCampaignModalOpen,
    isCampaignDetailsModalOpen,
    isAddResourceModalOpen,
    setIsAddResourceModalOpen,
    isAddToCampaignModalOpen,
    isEditFileModalOpen,

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
  };
}
