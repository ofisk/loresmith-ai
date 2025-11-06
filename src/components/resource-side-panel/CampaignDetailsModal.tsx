import { FloppyDisk, PencilSimple, Trash } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import type { Campaign } from "@/types/campaign";
import { Button } from "@/components/button/Button";
import { FormButton } from "@/components/button/FormButton";
import { FormField } from "@/components/input/FormField";
import { Modal } from "@/components/modal/Modal";

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

  // Reset form when campaign changes
  useEffect(() => {
    if (campaign) {
      setEditedName(campaign.name);
      setEditedDescription(campaign.description || "");
    }
  }, [campaign]);

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

        {/* Campaign Info */}
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

        {/* Actions */}
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
      </div>
    </Modal>
  );
}
