import { useCallback, useEffect } from "react";
import { Modal } from "@/components/modal/Modal";
import { BlockingAuthenticationModal } from "@/components/BlockingAuthenticationModal";
import { logger } from "@/lib/logger";
import { CreateCampaignModal } from "@/components/resource-side-panel/CreateCampaignModal";
import { CampaignDetailsModal } from "@/components/resource-side-panel/CampaignDetailsModal";
import { EditFileModal } from "@/components/upload/EditFileModal";
import { ResourceUpload } from "@/components/upload/ResourceUpload";
import { MultiSelect } from "@/components/select/MultiSelect";
import { TelemetryDashboard } from "@/components/admin/TelemetryDashboard";
import { FormButton } from "@/components/button/FormButton";
import { NOTIFICATION_TYPES } from "@/constants/notification-types";
import { STANDARD_MODAL_SIZE_OBJECT } from "@/constants/modal-sizes";
import { API_CONFIG } from "@/shared-config";
import { authenticatedFetchWithExpiration } from "@/services/core/auth-service";
import type { Campaign } from "@/types/campaign";
import type { FileMetadata } from "@/dao";
import type { useModalState } from "@/hooks/useModalState";
import type { useAppAuthentication } from "@/hooks/useAppAuthentication";
import type { useCampaignAddition } from "@/hooks/useCampaignAddition";
import type { useLocalNotifications } from "@/hooks/useLocalNotifications";

interface AppModalsProps {
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
  addLocalNotification: ReturnType<
    typeof useLocalNotifications
  >["addLocalNotification"];
}

/**
 * AppModals component - Manages all application modals
 */
export function AppModals({
  modalState,
  authState,
  campaigns,
  refetchCampaigns,
  createCampaign,
  handleUpload,
  handleFileUpdate,
  addFileToCampaigns,
  addLocalNotification,
}: AppModalsProps) {
  // Debug: Log when auth modal state changes
  useEffect(() => {
    const log = logger.scope("[AppModals]");
    log.debug("Auth modal state changed", {
      showAuthModal: modalState.showAuthModal,
      username: authState.username,
      hasStoredKey: !!authState.storedOpenAIKey,
    });
    if (modalState.showAuthModal) {
      log.info("Auth modal should be visible");
    } else {
      log.debug("Auth modal should be hidden");
    }
  }, [modalState.showAuthModal, authState.username, authState.storedOpenAIKey]);

  // Ensure modal shows on initial load if no JWT exists
  useEffect(() => {
    const log = logger.scope("[AppModals]");
    const checkInitialAuth = async () => {
      const jwt = authState.getStoredJwt();
      if (!jwt && !modalState.showAuthModal) {
        log.info("No JWT found on initial load, showing auth modal");
        modalState.setShowAuthModal(true);
      }
    };
    // Small delay to allow other hooks to initialize first
    const timer = setTimeout(checkInitialAuth, 100);
    return () => clearTimeout(timer);
  }, [authState, modalState]);

  const handleAuthenticationSubmit = useCallback(
    async (username: string, adminKey: string, openaiApiKey: string) => {
      const log = logger.scope("[AppModals]");
      try {
        log.debug("Starting authentication");
        const success = await authState.handleAuthenticationSubmit(
          username,
          adminKey,
          openaiApiKey
        );
        if (success) {
          log.info("Authentication successful, closing modal");
          modalState.setShowAuthModal(false);
        } else {
          log.warn("Authentication returned false, keeping modal open");
        }
      } catch (error) {
        log.error("Authentication error", error);
        // Don't close modal on error - let BlockingAuthenticationModal show the error
        throw error;
      }
    },
    [authState, modalState]
  );

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
        console.error("Failed to delete campaign:", error);
        addLocalNotification(
          NOTIFICATION_TYPES.ERROR,
          "Deletion Failed",
          error instanceof Error ? error.message : "Failed to delete campaign."
        );
      }
    },
    [authState, modalState, refetchCampaigns, addLocalNotification]
  );

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
        console.error("Failed to update campaign:", error);
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
        storedOpenAIKey={authState.storedOpenAIKey}
        googlePendingToken={modalState.googlePendingToken}
        onSubmit={handleAuthenticationSubmit}
        onLoginSuccess={async (token) => {
          await authState.acceptToken(token);
          modalState.setGooglePendingToken(null);
          modalState.setShowAuthModal(false);
        }}
      />

      {/* Create Campaign Modal */}
      <Modal
        isOpen={modalState.isCreateCampaignModalOpen}
        onClose={modalState.handleCreateCampaignClose}
        cardStyle={STANDARD_MODAL_SIZE_OBJECT}
        showCloseButton={true}
      >
        <CreateCampaignModal
          isOpen={modalState.isCreateCampaignModalOpen}
          onClose={modalState.handleCreateCampaignClose}
          campaignName={modalState.campaignName}
          onCampaignNameChange={modalState.setCampaignName}
          campaignDescription={modalState.campaignDescription}
          onCampaignDescriptionChange={modalState.setCampaignDescription}
          onCreateCampaign={async (name, description) => {
            try {
              await createCampaign(name, description);
              await refetchCampaigns();
              modalState.handleCreateCampaignClose();
            } catch (error) {
              // Keep modal open on error so user can retry
              console.error("Campaign creation failed:", error);
            }
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
        onAddFileToCampaign={async (fileKey: string, fileName: string) => {
          if (modalState.selectedCampaign) {
            await addFileToCampaigns(
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
        cardStyle={STANDARD_MODAL_SIZE_OBJECT}
        showCloseButton={true}
      >
        <ResourceUpload
          onUpload={async (file, filename, description, tags) => {
            console.log("Uploading file:", file);

            // Close modal immediately
            modalState.handleAddResourceClose();

            // Start upload in background
            try {
              await handleUpload(file, filename, description, tags);
            } catch (error) {
              console.error("Upload failed:", error);
              // Show error notification since modal is already closed
              addLocalNotification(
                NOTIFICATION_TYPES.ERROR,
                "Upload Failed",
                `Failed to upload "${filename}". Please try again.`
              );
            }
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
        cardStyle={STANDARD_MODAL_SIZE_OBJECT}
        showCloseButton={true}
      >
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">
            "{modalState.selectedFile ? modalState.selectedFile.file_name : ""}"
            - Add to Campaign
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Choose which legendary adventures this tome shall join:
          </p>
          <div className="space-y-3">
            {availableCampaigns.length === 0 ? (
              <div className="text-center py-6">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  This file has already been added to all available campaigns.
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  Create a new campaign to add this file to additional
                  adventures.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select campaigns to add this file to:
                </div>
                <MultiSelect
                  options={availableCampaigns.map((campaign) => ({
                    value: campaign.campaignId,
                    label: campaign.name,
                  }))}
                  selectedValues={modalState.selectedCampaigns}
                  onSelectionChange={modalState.setSelectedCampaigns}
                  placeholder="Choose campaigns..."
                  closeOnSelect={true}
                />
              </div>
            )}

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex gap-2">
                {availableCampaigns.length > 0 && (
                  <FormButton
                    variant="primary"
                    onClick={async () => {
                      // Close modal and clear selections immediately
                      modalState.setSelectedCampaigns([]);
                      modalState.handleAddToCampaignClose();

                      // Use the extracted campaign addition logic
                      if (!modalState.selectedFile) {
                        return;
                      }
                      await addFileToCampaigns(
                        modalState.selectedFile,
                        modalState.selectedCampaigns,
                        authState.getStoredJwt,
                        addLocalNotification,
                        () => {
                          // Success callback - modal is already closed
                        }
                      );
                    }}
                  >
                    {availableCampaigns.length === 0
                      ? "Close"
                      : "Add to campaign"}
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
              console.log("[AppModals] Processing tags for EditFileModal:", {
                tags,
                type: typeof tags,
                isArray: Array.isArray(tags),
                file_key: modalState.editingFile.file_key,
              });

              if (Array.isArray(tags)) {
                console.log(
                  "[AppModals] Tags is already array, returning as-is:",
                  tags
                );
                return tags;
              }
              if (typeof tags === "string") {
                // Try to parse as JSON first (common case)
                try {
                  console.log(
                    "[AppModals] Attempting to parse tags as JSON:",
                    tags
                  );
                  const parsed = JSON.parse(tags);
                  console.log(
                    "[AppModals] JSON.parse succeeded, parsed:",
                    parsed
                  );
                  if (Array.isArray(parsed)) {
                    console.log(
                      "[AppModals] Parsed result is array, returning:",
                      parsed
                    );
                    return parsed;
                  }
                  console.log(
                    "[AppModals] Parsed result is not array, falling back to comma-split"
                  );
                } catch (err) {
                  console.log(
                    "[AppModals] JSON.parse failed, treating as comma-separated string. Error:",
                    err
                  );
                  // Not JSON, treat as comma-separated string
                }
                // Fallback: treat as comma-separated string
                const split = tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter((t) => t.length > 0);
                console.log("[AppModals] Split tags by comma:", split);
                return split;
              }
              console.log(
                "[AppModals] Tags is not array or string, returning empty array"
              );
              return [];
            })(),
          }}
          onUpdate={(updatedFile) => {
            console.log(
              "[AppModals] EditFileModal onUpdate called with:",
              updatedFile
            );
            handleFileUpdate(updatedFile as FileMetadata);
          }}
        />
      )}

      {/* Admin Dashboard Modal */}
      <Modal
        isOpen={modalState.isAdminDashboardModalOpen}
        onClose={modalState.handleAdminDashboardClose}
        cardStyle={STANDARD_MODAL_SIZE_OBJECT}
        showCloseButton={true}
      >
        <TelemetryDashboard />
      </Modal>
    </>
  );
}
