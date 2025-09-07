import { Modal } from "../modal/Modal";
import type { Campaign } from "../../types/campaign";

interface CampaignSuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  uploadedFileInfo: {
    filename: string;
    fileKey: string;
  } | null;
  campaigns: Campaign[];
  campaignName: string;
  onCampaignNameChange: (name: string) => void;
  onAddToCampaign: (campaignId: string) => void;
  onCreateCampaignForFile: () => void;
}

export function CampaignSuggestionModal({
  isOpen,
  onClose,
  uploadedFileInfo,
  campaigns,
  campaignName,
  onCampaignNameChange,
  onAddToCampaign,
  onCreateCampaignForFile,
}: CampaignSuggestionModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-ob-base-200">
          Would you like to add "{uploadedFileInfo?.filename}" to an existing
          campaign or create a new one?
        </p>

        {campaigns.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-medium text-ob-base-200">
              Existing Campaigns:
            </h3>
            <div className="space-y-1">
              {campaigns.map((campaign) => (
                <button
                  type="button"
                  key={campaign.campaignId}
                  onClick={() => onAddToCampaign(campaign.campaignId)}
                  className="w-full text-left p-2 bg-ob-base-700 hover:bg-ob-base-600 rounded text-sm text-ob-base-200 transition-colors"
                >
                  {campaign.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="font-medium text-ob-base-200">Create New Campaign:</h3>
          <input
            type="text"
            placeholder="Campaign name"
            value={campaignName}
            onChange={(e) => onCampaignNameChange(e.target.value)}
            className="w-full px-3 py-2 bg-ob-base-700 border border-ob-base-600 rounded text-ob-base-200 placeholder-ob-base-400 focus:outline-none focus:ring-2 focus:ring-ob-primary-500"
          />
          <button
            type="button"
            onClick={onCreateCampaignForFile}
            disabled={!campaignName.trim()}
            className="w-full px-4 py-2 bg-ob-primary-600 hover:bg-ob-primary-700 disabled:bg-ob-base-600 disabled:cursor-not-allowed text-white rounded font-medium transition-colors"
          >
            Create Campaign & Add File
          </button>
        </div>
      </div>
    </Modal>
  );
}
