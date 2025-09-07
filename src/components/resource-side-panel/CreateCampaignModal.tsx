import { useId } from "react";
import { Modal } from "../modal/Modal";

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
  const campaignNameId = useId();
  const campaignDescriptionId = useId();

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label
            htmlFor={campaignNameId}
            className="block text-sm font-medium text-ob-base-200 mb-2"
          >
            Campaign Name
          </label>
          <input
            id={campaignNameId}
            type="text"
            placeholder="Enter campaign name"
            value={campaignName}
            onChange={(e) => onCampaignNameChange(e.target.value)}
            className="w-full px-3 py-2 bg-ob-base-700 border border-ob-base-600 rounded text-ob-base-200 placeholder-ob-base-400 focus:outline-none focus:ring-2 focus:ring-ob-primary-500"
          />
        </div>
        <div>
          <label
            htmlFor={campaignDescriptionId}
            className="block text-sm font-medium text-ob-base-200 mb-2"
          >
            Description (Optional)
          </label>
          <textarea
            id={campaignDescriptionId}
            placeholder="Enter campaign description"
            value={campaignDescription}
            onChange={(e) => onCampaignDescriptionChange(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-ob-base-700 border border-ob-base-600 rounded text-ob-base-200 placeholder-ob-base-400 focus:outline-none focus:ring-2 focus:ring-ob-primary-500 resize-none"
          />
        </div>
        <button
          type="button"
          onClick={onCreateCampaign}
          disabled={!campaignName.trim()}
          className="w-full px-4 py-2 bg-ob-primary-600 hover:bg-ob-primary-700 disabled:bg-ob-base-600 disabled:cursor-not-allowed text-white rounded font-medium transition-colors"
        >
          Create Campaign
        </button>
      </div>
    </Modal>
  );
}
