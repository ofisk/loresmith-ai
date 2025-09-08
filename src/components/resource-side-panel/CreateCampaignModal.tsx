import { useId } from "react";

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
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-ob-base-200 mb-2">
          Create new campaign
        </h2>
        <p className="text-sm text-ob-base-400">
          Set up a new campaign for your resources
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor={campaignNameId}
            className="block text-sm font-medium text-ob-base-200 mb-2"
          >
            Campaign name
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
            Description (optional)
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
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 px-4 py-2 bg-ob-base-600 hover:bg-ob-base-500 text-ob-base-200 rounded font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onCreateCampaign}
          disabled={!campaignName.trim()}
          className="flex-1 px-4 py-2 bg-ob-primary-600 hover:bg-ob-primary-700 disabled:bg-ob-base-600 disabled:cursor-not-allowed text-white rounded font-medium transition-colors"
        >
          Create campaign
        </button>
      </div>
    </div>
  );
}
