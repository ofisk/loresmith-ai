import { CaretDown, SignOut } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useFileUpload, useCampaignManagement } from "../../hooks";
import { AuthService } from "../../services/auth-service";
import { Modal } from "../modal/Modal";
import { StorageTracker } from "../storage-tracker";
import { ResourceUpload } from "../upload/ResourceUpload";
import { CampaignsSection } from "./CampaignsSection";
import { LibrarySection } from "./LibrarySection";
import { CampaignSuggestionModal } from "./CampaignSuggestionModal";
import { CreateCampaignModal } from "./CreateCampaignModal";

interface ResourceSidePanelProps {
  className?: string;
  isAuthenticated?: boolean;
  onLogout?: () => Promise<void>;
  showUserMenu?: boolean;
  setShowUserMenu?: (show: boolean) => void;
  triggerFileUpload?: boolean;
  onFileUploadTriggered?: () => void;
  onSendNotification?: (message: string) => void;
}

export function ResourceSidePanel({
  className = "",
  isAuthenticated = false,
  onLogout,
  showUserMenu = false,
  setShowUserMenu,
  triggerFileUpload = false,
  onFileUploadTriggered,
  onSendNotification,
}: ResourceSidePanelProps) {
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isCampaignsOpen, setIsCampaignsOpen] = useState(false);
  const [refreshTrigger] = useState(0);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCreateCampaignModalOpen, setIsCreateCampaignModalOpen] =
    useState(false);
  const [isCampaignSuggestionModalOpen, setIsCampaignSuggestionModalOpen] =
    useState(false);

  // Custom hooks for business logic
  const { uploadedFileInfo, handleUpload, clearUploadedFileInfo } =
    useFileUpload({
      onSendNotification,
      onUploadSuccess: () => {
        setIsCampaignSuggestionModalOpen(true);
      },
    });

  const {
    campaigns,
    campaignsLoading,
    campaignsError,
    campaignName,
    setCampaignName,
    campaignDescription,
    setCampaignDescription,
    fetchCampaigns,
    handleCreateCampaign,
    handleAddFileToCampaign,
    handleCreateCampaignForFile,
  } = useCampaignManagement({
    isAuthenticated,
    onSendNotification,
  });

  // Watch for external trigger to open file upload modal
  useEffect(() => {
    if (triggerFileUpload) {
      setIsAddModalOpen(true);
      onFileUploadTriggered?.();
    }
  }, [triggerFileUpload, onFileUploadTriggered]);

  // Fetch campaigns when campaigns section is opened
  useEffect(() => {
    if (isCampaignsOpen && isAuthenticated) {
      fetchCampaigns();
    }
  }, [isCampaignsOpen, isAuthenticated, fetchCampaigns]);

  // Fetch campaigns when campaign suggestion modal opens
  useEffect(() => {
    if (isCampaignSuggestionModalOpen && isAuthenticated) {
      fetchCampaigns();
    }
  }, [isCampaignSuggestionModalOpen, isAuthenticated, fetchCampaigns]);

  const handleLogout = async () => {
    try {
      await onLogout?.();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleAddToCampaign = async (campaignId: string) => {
    await handleAddFileToCampaign(campaignId, uploadedFileInfo);
    setIsCampaignSuggestionModalOpen(false);
    clearUploadedFileInfo();
  };

  const handleCreateCampaignForFileWrapper = async () => {
    await handleCreateCampaignForFile(uploadedFileInfo);
    setIsCreateCampaignModalOpen(false);
    setIsCampaignSuggestionModalOpen(false);
    clearUploadedFileInfo();
  };

  const handleCreateCampaignWrapper = async () => {
    await handleCreateCampaign();
    setIsCreateCampaignModalOpen(false);
  };

  return (
    <div
      className={`w-80 h-full bg-neutral-50 dark:bg-neutral-900 border-r border-neutral-300 dark:border-neutral-800 flex flex-col ${className}`}
    >
      {/* Header */}
      <div className="p-4 border-b border-neutral-300 dark:border-neutral-800">
        <h2 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
          Resources
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Manage your campaign content
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Campaigns Section */}
        <CampaignsSection
          campaigns={campaigns}
          campaignsLoading={campaignsLoading}
          campaignsError={campaignsError}
          onToggle={() => setIsCampaignsOpen(!isCampaignsOpen)}
          isOpen={isCampaignsOpen}
          onCreateCampaign={() => setIsCreateCampaignModalOpen(true)}
        />

        {/* Library Section */}
        <LibrarySection
          isOpen={isLibraryOpen}
          onToggle={() => setIsLibraryOpen(!isLibraryOpen)}
          refreshTrigger={refreshTrigger}
          onAddToLibrary={() => setIsAddModalOpen(true)}
        />

        {/* Storage Tracker */}
        <div className="p-4">
          <StorageTracker />
        </div>
      </div>

      {/* Username Display and Menu - At the very bottom */}
      {isAuthenticated && (
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
          <div className="relative user-menu-container">
            <button
              type="button"
              onClick={() => setShowUserMenu?.(!showUserMenu)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-md transition-colors w-full"
            >
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              <span className="truncate">
                {AuthService.getUsernameFromStoredJwt()}
              </span>
              <CaretDown
                size={16}
                className="transition-transform duration-200 ml-auto"
              />
            </button>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <div className="absolute bottom-full left-0 mb-2 w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-lg z-50">
                <div className="py-1">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors flex items-center gap-2"
                  >
                    <SignOut size={16} />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        cardStyle={{ width: 560, height: 560 }}
      >
        <ResourceUpload
          onUpload={handleUpload}
          className="border-0 p-0 shadow-none"
          jwtUsername={AuthService.getUsernameFromStoredJwt()}
        />
      </Modal>

      {/* Create Campaign Modal */}
      <Modal
        isOpen={isCreateCampaignModalOpen}
        onClose={() => setIsCreateCampaignModalOpen(false)}
        cardStyle={{ width: 480, height: 400 }}
      >
        <CreateCampaignModal
          isOpen={isCreateCampaignModalOpen}
          onClose={() => {
            setIsCreateCampaignModalOpen(false);
            setCampaignName("");
            setCampaignDescription("");
          }}
          campaignName={campaignName}
          onCampaignNameChange={setCampaignName}
          campaignDescription={campaignDescription}
          onCampaignDescriptionChange={setCampaignDescription}
          onCreateCampaign={handleCreateCampaignWrapper}
        />
      </Modal>

      {/* Campaign Suggestion Modal */}
      <Modal
        isOpen={isCampaignSuggestionModalOpen}
        onClose={() => {
          setIsCampaignSuggestionModalOpen(false);
          clearUploadedFileInfo();
        }}
        cardStyle={{ width: 520, height: 500 }}
      >
        <CampaignSuggestionModal
          isOpen={isCampaignSuggestionModalOpen}
          onClose={() => {
            setIsCampaignSuggestionModalOpen(false);
            clearUploadedFileInfo();
          }}
          uploadedFileInfo={uploadedFileInfo}
          campaigns={campaigns}
          campaignName={campaignName}
          onCampaignNameChange={setCampaignName}
          onAddToCampaign={handleAddToCampaign}
          onCreateCampaignForFile={handleCreateCampaignForFileWrapper}
        />
      </Modal>
    </div>
  );
}
