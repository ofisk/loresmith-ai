import { useEffect, useState } from "react";
import { FormField } from "../input/FormField";
import { FormButton } from "../button/FormButton";

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignName: string;
  onCampaignNameChange: (name: string) => void;
  campaignDescription: string;
  onCampaignDescriptionChange: (description: string) => void;
  onCreateCampaign: (name: string, description: string) => Promise<void>;
}

export function CreateCampaignModal({
  isOpen,
  onClose,
  campaignName,
  onCampaignNameChange,
  campaignDescription,
  onCampaignDescriptionChange,
  onCreateCampaign,
}: CreateCampaignModalProps) {
  const [name, setName] = useState(campaignName);
  const [description, setDescription] = useState(campaignDescription);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync with parent state when modal opens
  useEffect(() => {
    if (isOpen) {
      setName(campaignName);
      setDescription(campaignDescription);
    }
  }, [isOpen, campaignName, campaignDescription]);

  const handleCreate = async () => {
    if (!name.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (typeof document !== "undefined") {
        document.body.style.cursor = "progress";
        document.documentElement.style.cursor = "progress";
      }
    } catch (_e) {}

    // Sync upstream state then close first for instant UX
    onCampaignNameChange(name);
    onCampaignDescriptionChange(description);
    onClose();

    try {
      // Kick off creation on next tick so close renders immediately
      await new Promise<void>((resolve) => {
        setTimeout(async () => {
          try {
            await onCreateCampaign(name, description);
          } finally {
            // Always reset cursor when campaign creation completes (success or failure)
            try {
              if (typeof document !== "undefined") {
                document.body.style.cursor = "";
                document.documentElement.style.cursor = "";
              }
            } catch (_e) {}
            resolve();
          }
        }, 0);
      });
    } catch (_error) {
      // Reset cursor on error
      try {
        if (typeof document !== "undefined") {
          document.body.style.cursor = "";
          document.documentElement.style.cursor = "";
        }
      } catch (_e) {}
    }
  };

  // Reset cursor and submitting state when modal closes/unmounts
  useEffect(() => {
    if (!isOpen) {
      setIsSubmitting(false);
      try {
        if (typeof document !== "undefined") {
          document.body.style.cursor = "";
          document.documentElement.style.cursor = "";
        }
      } catch (_e) {}
    }
  }, [isOpen]);

  const campaignNameId = "campaign-name";
  const campaignDescriptionId = "campaign-description";

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Create new campaign
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Forge a new adventure and gather your party
        </p>
      </div>

      {/* Campaign Info */}
      <div className="space-y-4">
        <FormField
          id={campaignNameId}
          label="Campaign name"
          placeholder="Name your legendary adventure..."
          value={name}
          onValueChange={(value) => setName(value)}
        />
        <FormField
          id={campaignDescriptionId}
          label="Description (optional)"
          placeholder="Describe the world, its mysteries, and the heroes who will shape its destiny..."
          value={description}
          onValueChange={(value) => setDescription(value)}
          multiline
          rows={4}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <FormButton
            onClick={handleCreate}
            disabled={!name.trim() || isSubmitting}
            loading={isSubmitting}
          >
            {isSubmitting ? "Creating…" : "Create"}
          </FormButton>
          <FormButton onClick={onClose} variant="secondary">
            Cancel
          </FormButton>
        </div>
      </div>
    </div>
  );
}
