import { FloppyDisk, PencilSimple, Trash, Plus } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import type { Campaign } from "@/types/campaign";
import type { SessionDigestWithData } from "@/types/session-digest";
import { Button } from "@/components/button/Button";
import { FormButton } from "@/components/button/FormButton";
import { FormField } from "@/components/input/FormField";
import { Modal } from "@/components/modal/Modal";
import { SessionDigestList } from "@/components/session/SessionDigestList";
import { SessionDigestModal } from "@/components/session/SessionDigestModal";
import { SessionDigestBulkImport } from "@/components/session/SessionDigestBulkImport";
import { useSessionDigests } from "@/hooks/useSessionDigests";
import type { SessionDigestData } from "@/types/session-digest";

interface CampaignDetailsModalProps {
  campaign: Campaign | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (campaignId: string) => Promise<void>;
  onUpdate: (
    campaignId: string,
    updates: { name: string; description: string }
  ) => Promise<void>;
  _isLoading?: boolean;
}

export function CampaignDetailsModal({
  campaign,
  isOpen,
  onClose,
  onDelete,
  onUpdate,
  _isLoading = false,
}: CampaignDetailsModalProps) {
  const nameId = useId();
  const descriptionId = useId();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(campaign?.name || "");
  const [editedDescription, setEditedDescription] = useState(
    campaign?.description || ""
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmProgress, setConfirmProgress] = useState(0);
  const confirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const confirmIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "digests">("details");
  const [isDigestModalOpen, setIsDigestModalOpen] = useState(false);
  const [editingDigest, setEditingDigest] =
    useState<SessionDigestWithData | null>(null);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkImportData, setBulkImportData] =
    useState<SessionDigestData | null>(null);

  const {
    digests,
    loading: digestsLoading,
    error: digestsError,
    fetchSessionDigests,
    deleteSessionDigest,
  } = useSessionDigests();

  // Reset form when campaign changes
  useEffect(() => {
    if (campaign) {
      setEditedName(campaign.name);
      setEditedDescription(campaign.description || "");
      if (isOpen && activeTab === "digests") {
        fetchSessionDigests.execute(campaign.campaignId);
      }
    }
  }, [campaign, isOpen, activeTab, fetchSessionDigests.execute]);

  // Fetch digests when switching to digests tab
  useEffect(() => {
    if (campaign && isOpen && activeTab === "digests") {
      fetchSessionDigests.execute(campaign.campaignId);
    }
  }, [campaign, isOpen, activeTab, fetchSessionDigests.execute]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
      if (confirmIntervalRef.current) {
        clearInterval(confirmIntervalRef.current);
      }
    };
  }, []);

  const handleSave = async () => {
    if (!campaign) return;

    setIsUpdating(true);
    try {
      await onUpdate(campaign.campaignId, {
        name: editedName,
        description: editedDescription,
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update campaign:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
    setConfirmProgress(0);

    // Start the countdown animation
    const startTime = Date.now();
    const duration = 7000; // 7 seconds

    confirmIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setConfirmProgress(progress * 100);

      if (progress >= 1) {
        // Auto-cancel when countdown completes
        handleDeleteCancel();
      }
    }, 50); // Update every 50ms for smooth animation
  };

  const handleDeleteConfirm = async () => {
    if (!campaign) return;

    setIsDeleting(true);
    try {
      await onDelete(campaign.campaignId);
      onClose();
    } catch (error) {
      console.error("Failed to delete campaign:", error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setConfirmProgress(0);

    // Clear timers
    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
    if (confirmIntervalRef.current) {
      clearInterval(confirmIntervalRef.current);
      confirmIntervalRef.current = null;
    }
  };

  const handleCancel = () => {
    setEditedName(campaign?.name || "");
    setEditedDescription(campaign?.description || "");
    setIsEditing(false);
  };

  const handleCreateDigest = () => {
    setEditingDigest(null);
    setBulkImportData(null);
    setIsDigestModalOpen(true);
  };

  const handleBulkImport = (importedData: SessionDigestData) => {
    setBulkImportData(importedData);
    setIsBulkImportOpen(false);
    setIsDigestModalOpen(true);
  };

  const handleEditDigest = (digest: SessionDigestWithData) => {
    setEditingDigest(digest);
    setIsDigestModalOpen(true);
  };

  const handleDeleteDigest = async (digest: SessionDigestWithData) => {
    if (
      !campaign ||
      !window.confirm(
        `Are you sure you want to delete Session ${digest.sessionNumber}?`
      )
    ) {
      return;
    }
    try {
      await deleteSessionDigest.execute(campaign.campaignId, digest.id);
    } catch (error) {
      console.error("Failed to delete session digest:", error);
    }
  };

  const handleDigestSave = () => {
    if (campaign) {
      fetchSessionDigests.execute(campaign.campaignId);
    }
  };

  const getSuggestedSessionNumber = (): number => {
    if (digests.length === 0) return 1;
    const maxSession = Math.max(...digests.map((d) => d.sessionNumber));
    return maxSession + 1;
  };

  if (!campaign) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-2xl"
      cardStyle={{ width: "800px", maxWidth: "90vw" }}
    >
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Campaign details
          </h2>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setActiveTab("details")}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "details"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("digests")}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "digests"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              Session digests
            </button>
          </div>
        </div>

        {/* Campaign Info - Details Tab */}
        {activeTab === "details" && (
          <div className="space-y-4">
            {/* Name */}
            {isEditing ? (
              <FormField
                id={nameId}
                label="Campaign name"
                value={editedName}
                onValueChange={(value) => setEditedName(value)}
                placeholder="Enter campaign name"
              />
            ) : (
              <div>
                <div className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Campaign name
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-gray-900 dark:text-gray-100">
                    {campaign.name}
                  </p>
                </div>
              </div>
            )}

            {/* Description */}
            {isEditing ? (
              <FormField
                id={descriptionId}
                label="Description"
                value={editedDescription}
                onValueChange={(value) => setEditedDescription(value)}
                placeholder="Enter campaign description"
                multiline
                rows={4}
              />
            ) : (
              <div>
                <div className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg min-h-[100px]">
                  <p className="text-gray-900 dark:text-gray-100">
                    {campaign.description || "No description provided"}
                  </p>
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
              <div>
                <span className="font-medium">Created:</span>{" "}
                {new Date(campaign.createdAt).toLocaleDateString()}
              </div>
              <div className="text-right">
                <span className="font-medium">ID:</span> {campaign.campaignId}
              </div>
            </div>
          </div>
        )}

        {/* Session Digests Tab */}
        {activeTab === "digests" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Session Digests
              </h3>
              <div className="flex gap-2">
                <FormButton
                  onClick={() => setIsBulkImportOpen(true)}
                  variant="secondary"
                >
                  Bulk Import
                </FormButton>
                <FormButton
                  onClick={handleCreateDigest}
                  icon={<Plus size={16} />}
                >
                  Create Digest
                </FormButton>
              </div>
            </div>
            <SessionDigestList
              digests={digests}
              loading={digestsLoading}
              error={digestsError}
              onEdit={handleEditDigest}
              onDelete={handleDeleteDigest}
            />
          </div>
        )}

        {/* Actions */}
        {activeTab === "details" && (
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <FormButton
                    onClick={handleSave}
                    disabled={isUpdating || !editedName.trim()}
                    loading={isUpdating}
                    icon={<FloppyDisk size={16} />}
                  >
                    {isUpdating ? "Saving..." : "Save changes"}
                  </FormButton>
                  <FormButton
                    onClick={handleCancel}
                    disabled={isUpdating}
                    variant="secondary"
                  >
                    Cancel
                  </FormButton>
                </>
              ) : (
                <FormButton
                  onClick={() => setIsEditing(true)}
                  icon={<PencilSimple size={16} />}
                >
                  Edit campaign
                </FormButton>
              )}
            </div>

            {!isEditing &&
              (showDeleteConfirm ? (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={handleDeleteCancel}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteConfirm}
                    disabled={isDeleting}
                    className="relative flex items-center gap-2 overflow-hidden"
                  >
                    {/* Progress bar background */}
                    <div
                      className="absolute inset-0 bg-gray-400/30 transition-all duration-75 ease-linear"
                      style={{ width: `${confirmProgress}%` }}
                    />
                    {/* Button content */}
                    <div className="relative z-10 flex items-center gap-2">
                      <Trash size={16} />
                      {isDeleting ? "Deleting..." : "Confirm delete"}
                    </div>
                  </Button>
                </div>
              ) : (
                <FormButton
                  onClick={handleDeleteClick}
                  disabled={isDeleting || isUpdating}
                  variant="destructive"
                  icon={<Trash size={16} />}
                >
                  Delete campaign
                </FormButton>
              ))}
          </div>
        )}
      </div>

      {/* Session Digest Modal */}
      {campaign && (
        <>
          <SessionDigestModal
            isOpen={isDigestModalOpen}
            onClose={() => {
              setIsDigestModalOpen(false);
              setEditingDigest(null);
              setBulkImportData(null);
            }}
            campaignId={campaign.campaignId}
            digest={editingDigest}
            suggestedSessionNumber={getSuggestedSessionNumber()}
            initialDigestData={bulkImportData}
            onSave={handleDigestSave}
          />
          <Modal
            isOpen={isBulkImportOpen}
            onClose={() => setIsBulkImportOpen(false)}
            cardStyle={{ width: "700px", maxWidth: "95vw" }}
            showCloseButton={true}
          >
            <div className="p-6">
              <SessionDigestBulkImport
                onImport={handleBulkImport}
                onCancel={() => setIsBulkImportOpen(false)}
              />
            </div>
          </Modal>
        </>
      )}
    </Modal>
  );
}
