import { CaretDown, SignOut } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useCampaignManagement } from "../../hooks/useCampaignManagement";
import { AuthService } from "../../services/auth-service";
import type { Campaign } from "../../types/campaign";
import { CampaignsSection } from "./CampaignsSection";
import { LibrarySection } from "./LibrarySection";

interface ResourceSidePanelProps {
  className?: string;
  isAuthenticated?: boolean;
  onLogout?: () => Promise<void>;
  showUserMenu?: boolean;
  setShowUserMenu?: (show: boolean) => void;
  triggerFileUpload?: boolean;
  onFileUploadTriggered?: () => void;
  onCreateCampaign?: () => void;
  onCampaignClick?: (campaign: Campaign) => void;
  onAddResource?: () => void;
  onAddToCampaign?: (file: any) => void;
  onEditFile?: (file: any) => void;
}

export function ResourceSidePanel({
  className = "",
  isAuthenticated = false,
  onLogout,
  showUserMenu = false,
  setShowUserMenu,
  triggerFileUpload = false,
  onFileUploadTriggered,
  onCreateCampaign,
  onCampaignClick,
  onAddResource,
  onAddToCampaign,
  onEditFile,
}: ResourceSidePanelProps) {
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isCampaignsOpen, setIsCampaignsOpen] = useState(false);

  const { campaigns, campaignsLoading, campaignsError, fetchCampaigns } =
    useCampaignManagement({
      isAuthenticated,
    });

  // Watch for external trigger to open file upload modal
  useEffect(() => {
    if (triggerFileUpload) {
      onAddResource?.();
      onFileUploadTriggered?.();
    }
  }, [triggerFileUpload, onAddResource, onFileUploadTriggered]);

  // Fetch campaigns when campaigns section is opened
  useEffect(() => {
    if (isCampaignsOpen && isAuthenticated) {
      fetchCampaigns();
    }
  }, [isCampaignsOpen, isAuthenticated, fetchCampaigns]);

  const handleLogout = async () => {
    try {
      await onLogout?.();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <div
      className={`w-80 h-full bg-neutral-50/80 dark:bg-neutral-900/80 border-r border-neutral-200 dark:border-neutral-700 flex flex-col backdrop-blur-sm ${className}`}
    >
      {/* Header */}
      <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
        <h2 className="font-semibold text-xl text-gray-900 dark:text-gray-100 mb-2">
          Resources
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Manage your campaign content
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Campaigns Section */}
        <CampaignsSection
          campaigns={campaigns}
          campaignsLoading={campaignsLoading}
          campaignsError={campaignsError}
          onToggle={() => setIsCampaignsOpen(!isCampaignsOpen)}
          isOpen={isCampaignsOpen}
          onCreateCampaign={onCreateCampaign || (() => {})}
          onCampaignClick={onCampaignClick || (() => {})}
        />

        {/* Library Section */}
        <LibrarySection
          isOpen={isLibraryOpen}
          onToggle={() => setIsLibraryOpen(!isLibraryOpen)}
          onAddToLibrary={onAddResource || (() => {})}
          onAddToCampaign={onAddToCampaign || (() => {})}
          onEditFile={onEditFile || (() => {})}
        />
      </div>

      {/* Username Display and Menu - At the very bottom */}
      {isAuthenticated && (
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50/80 dark:bg-neutral-900/80 backdrop-blur-sm">
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
    </div>
  );
}
