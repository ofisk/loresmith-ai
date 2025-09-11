import { useEffect, useState } from "react";
import { Input } from "../input/Input";
import { Textarea } from "../textarea/Textarea";

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignName: string;
  onCampaignNameChange: (name: string) => void;
  campaignDescription: string;
  onCampaignDescriptionChange: (description: string) => void;
  onCreateCampaign: (name: string, description: string) => void;
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

  // Sync with parent state when modal opens
  useEffect(() => {
    if (isOpen) {
      setName(campaignName);
      setDescription(campaignDescription);
    }
  }, [isOpen, campaignName, campaignDescription]);

  const handleCreate = () => {
    onCampaignNameChange(name);
    onCampaignDescriptionChange(description);
    onCreateCampaign(name, description);
  };

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
          Set up a new campaign for your resources
        </p>
      </div>

      {/* Campaign Info */}
      <div className="space-y-4">
        <div>
          <label
            htmlFor={campaignNameId}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Campaign name
          </label>
          <Input
            id={campaignNameId}
            type="text"
            placeholder="Enter campaign name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full"
          />
        </div>
        <div>
          <label
            htmlFor={campaignDescriptionId}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Description (optional)
          </label>
          <Textarea
            id={campaignDescriptionId}
            placeholder="Enter campaign description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full resize-none"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim()}
            className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-semibold text-sm hover:text-purple-700 dark:hover:text-purple-300 transition-colors disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 font-semibold text-sm hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
