import { useState, useEffect } from "react";
import { Input } from "../input/Input";
import { Textarea } from "../textarea/Textarea";

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignName: string;
  onCampaignNameChange: (name: string) => void;
  campaignDescription: string;
  onCampaignDescriptionChange: (description: string) => void;
  onCreateCampaign: () => void;
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
  const [localName, setLocalName] = useState(campaignName);
  const [localDescription, setLocalDescription] = useState(campaignDescription);

  // Sync with parent state when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalName(campaignName);
      setLocalDescription(campaignDescription);
    }
  }, [isOpen, campaignName, campaignDescription]);

  const handleCreate = () => {
    onCampaignNameChange(localName);
    onCampaignDescriptionChange(localDescription);
    onCreateCampaign();
  };

  const campaignNameId = "campaign-name";
  const campaignDescriptionId = "campaign-description";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Create new campaign
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Set up a new campaign for your resources
        </p>
      </div>

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
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
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
            value={localDescription}
            onChange={(e) => setLocalDescription(e.target.value)}
            rows={3}
            className="w-full resize-none"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 font-semibold text-sm hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!localName.trim()}
          className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-semibold text-sm hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
        >
          Create
        </button>
      </div>
    </div>
  );
}
