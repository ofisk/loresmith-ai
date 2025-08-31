import {
  CaretDown,
  CaretRight,
  CheckCircle,
  Clock,
  FileText,
  Plus,
  SignOut,
  XCircle,
} from "@phosphor-icons/react";
import { useId } from "react";
import { useResourceSidePanel } from "../../hooks/useResourceSidePanel";
import { Card } from "../card/Card";
import { Modal } from "../modal/Modal";
import { StorageTracker } from "../storage-tracker";
import { ResourceList } from "../upload/ResourceList";
import { ResourceUpload } from "../upload/ResourceUpload";

interface ResourceSidePanelProps {
  className?: string;
  isAuthenticated?: boolean;
  onLogout?: () => Promise<void>;
  showUserMenu?: boolean;
  setShowUserMenu?: (show: boolean) => void;
}

export function ResourceSidePanel({
  className = "",
  isAuthenticated = false,
  onLogout,
  showUserMenu = false,
  setShowUserMenu: _setShowUserMenu,
}: ResourceSidePanelProps) {
  const campaignNameId = useId();

  const {
    // State
    isLibraryOpen,
    isCampaignsOpen,
    refreshTrigger,
    isCreateCampaignModalOpen,
    campaignName,
    campaigns,
    campaignsLoading,
    campaignsError,
    fileUploads,
    currentUploadId,

    // Actions
    fetchCampaigns,
    handleCreateCampaign,
    handleFileUpload,

    // State setters
    setIsLibraryOpen,
    setIsCampaignsOpen,
    setIsCreateCampaignModalOpen,
    setCampaignName,
  } = useResourceSidePanel();

  // Get the current upload for display (if any)
  const currentUpload = currentUploadId
    ? fileUploads.get(currentUploadId)
    : null;
  const showProgress =
    currentUpload && currentUpload.progress?.currentStep !== "idle";

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
        <Card className="p-0">
          <button
            type="button"
            onClick={() => setIsCampaignsOpen(!isCampaignsOpen)}
            className="w-full p-3 flex items-center justify-between text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-purple-600" />
              <span className="font-medium">Your campaigns</span>
            </div>
            {isCampaignsOpen ? (
              <CaretDown size={16} />
            ) : (
              <CaretRight size={16} />
            )}
          </button>

          {isCampaignsOpen && (
            <div className="border-t border-neutral-200 dark:border-neutral-700 h-48 overflow-y-auto">
              {isAuthenticated ? (
                <>
                  <div className="p-3">
                    <button
                      type="button"
                      onClick={() => setIsCreateCampaignModalOpen(true)}
                      className="w-full px-3 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <Plus size={14} />
                      Create campaign
                    </button>
                  </div>
                  {campaignsLoading ? (
                    <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 text-center">
                      <div className="text-gray-500 mb-2">
                        Loading campaigns...
                      </div>
                    </div>
                  ) : campaignsError ? (
                    <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 text-center">
                      <div className="text-red-500 mb-2">
                        Error loading campaigns
                      </div>
                      <p className="text-sm text-gray-400">{campaignsError}</p>
                      <button
                        type="button"
                        onClick={fetchCampaigns}
                        className="mt-2 text-sm text-purple-600 hover:text-purple-700 underline"
                      >
                        Retry
                      </button>
                    </div>
                  ) : campaigns.length === 0 ? (
                    <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 text-center">
                      <div className="text-gray-500 mb-2">
                        The war room awaits
                      </div>
                      <p className="text-sm text-gray-400">
                        Forge your first campaign to begin the adventure
                      </p>
                    </div>
                  ) : (
                    <div className="border-t border-neutral-200 dark:border-neutral-700">
                      {campaigns.map((campaign) => (
                        <div
                          key={campaign.campaignId}
                          className="p-3 border-b border-neutral-200 dark:border-neutral-700 last:border-b-0 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                        >
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {campaign.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Created{" "}
                            {new Date(campaign.createdAt).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 text-center">
                  <div className="text-gray-500 mb-2">Please log in</div>
                  <p className="text-sm text-gray-400">
                    Sign in to manage your campaigns
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Library Section */}
        <Card className="p-0">
          <button
            type="button"
            onClick={() => setIsLibraryOpen(!isLibraryOpen)}
            className="w-full p-3 flex items-center justify-between text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-purple-600" />
              <span className="font-medium">Your resource library</span>
            </div>
            {isLibraryOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
          </button>

          {isLibraryOpen && (
            <div className="border-t border-neutral-200 dark:border-neutral-700">
              {isAuthenticated ? (
                <div className="p-3">
                  <ResourceUpload
                    onUpload={handleFileUpload}
                    className="mb-2"
                  />
                  <ResourceList refreshTrigger={refreshTrigger} />
                </div>
              ) : (
                <div className="p-4 text-center">
                  <div className="text-gray-500 mb-2">Please log in</div>
                  <p className="text-sm text-gray-400">
                    Sign in to access your library
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Upload Progress */}
        {showProgress && currentUpload && (
          <Card className="p-3 mt-4">
            <div className="flex items-center gap-2 mb-2">
              {currentUpload.progress.currentStep === "uploading" && (
                <Clock size={16} className="text-blue-500 animate-spin" />
              )}
              {currentUpload.progress.currentStep === "success" && (
                <CheckCircle size={16} className="text-green-500" />
              )}
              {currentUpload.progress.currentStep === "error" && (
                <XCircle size={16} className="text-red-500" />
              )}
              <span className="text-sm font-medium">
                {currentUpload.filename}
              </span>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              {currentUpload.progress.message}
            </div>
            {currentUpload.progress.autoragStatus && (
              <div className="text-xs text-blue-600 dark:text-blue-400 mb-2">
                {currentUpload.progress.autoragStatus}
              </div>
            )}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${currentUpload.progress.percentage}%`,
                }}
              />
            </div>
          </Card>
        )}
      </div>

      {/* Storage Tracker */}
      {isAuthenticated && <StorageTracker />}

      {/* Create Campaign Modal */}
      <Modal
        isOpen={isCreateCampaignModalOpen}
        onClose={() => setIsCreateCampaignModalOpen(false)}
      >
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Create new campaign
            </h3>
          </div>
          <div>
            <label
              htmlFor={campaignNameId}
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Campaign name
            </label>
            <input
              id={campaignNameId}
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Enter campaign name"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreateCampaignModalOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateCampaign}
              disabled={!campaignName.trim()}
              className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create campaign
            </button>
          </div>
        </div>
      </Modal>

      {/* User Menu */}
      {showUserMenu && (
        <div className="absolute top-4 right-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50">
          <div className="p-2">
            <button
              type="button"
              onClick={onLogout}
              className="w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
            >
              <SignOut size={16} />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
